import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { buildArtifactObjectKey, DEAL_STATUSES, ARTIFACT_TYPES } from "@entitlement-os/shared";
import type { ArtifactType, DealStatus, ArtifactSpec } from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabase";
import OpenAI from "openai";

// Stage index for prerequisite checks (higher index = later stage)
const statusIndex = (s: DealStatus) => DEAL_STATUSES.indexOf(s);

// Minimum deal status required for each artifact type
const STAGE_PREREQUISITES: Record<ArtifactType, DealStatus> = {
  TRIAGE_PDF: "TRIAGE_DONE",
  SUBMISSION_CHECKLIST_PDF: "PREAPP",
  HEARING_DECK_PPTX: "SUBMITTED",
  EXIT_PACKAGE_PDF: "APPROVED",
  BUYER_TEASER_PDF: "EXIT_MARKETED",
  INVESTMENT_MEMO_PDF: "TRIAGE_DONE",
  OFFERING_MEMO_PDF: "APPROVED",
  COMP_ANALYSIS_PDF: "TRIAGE_DONE",
};

function isAtOrPast(current: string, required: DealStatus): boolean {
  const ci = statusIndex(current as DealStatus);
  const ri = statusIndex(required);
  // KILLED and unknown statuses should not pass
  if (ci < 0) return false;
  return ci >= ri;
}

// POST /api/deals/[id]/artifacts — generate an artifact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const artifactType = body.artifactType as string;

    // Validate artifact type
    if (!ARTIFACT_TYPES.includes(artifactType as ArtifactType)) {
      return NextResponse.json(
        { error: `Invalid artifactType. Must be one of: ${ARTIFACT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const aType = artifactType as ArtifactType;

    // Load deal with relations
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      include: {
        parcels: { orderBy: { createdAt: "asc" } },
        jurisdiction: true,
      },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Stage prerequisite check
    const requiredStatus = STAGE_PREREQUISITES[aType];
    if (!isAtOrPast(deal.status, requiredStatus)) {
      return NextResponse.json(
        { error: `Deal must be at ${requiredStatus} or later to generate ${aType}. Current status: ${deal.status}` },
        { status: 400 }
      );
    }

    // Data prerequisite checks
    const requiresParcels: ArtifactType[] = ["SUBMISSION_CHECKLIST_PDF", "HEARING_DECK_PPTX", "BUYER_TEASER_PDF", "OFFERING_MEMO_PDF"];
    if (requiresParcels.includes(aType) && deal.parcels.length === 0) {
      return NextResponse.json(
        { error: `At least one parcel is required to generate ${aType}` },
        { status: 400 }
      );
    }

    // Load latest succeeded triage run if needed
    let triageOutput: Record<string, unknown> | null = null;
    const requiresTriage: ArtifactType[] = [
      "TRIAGE_PDF", "HEARING_DECK_PPTX", "EXIT_PACKAGE_PDF",
      "INVESTMENT_MEMO_PDF", "OFFERING_MEMO_PDF", "COMP_ANALYSIS_PDF",
    ];
    if (requiresTriage.includes(aType)) {
      const triageRun = await prisma.run.findFirst({
        where: { dealId: id, orgId: auth.orgId, runType: "TRIAGE", status: "succeeded" },
        orderBy: { startedAt: "desc" },
        select: { outputJson: true },
      });
      if (!triageRun?.outputJson) {
        return NextResponse.json(
          { error: `A successful triage run is required to generate ${aType}` },
          { status: 400 }
        );
      }
      triageOutput = triageRun.outputJson as Record<string, unknown>;
    }

    // For COMP_ANALYSIS_PDF, load comparison deal IDs from body
    let comparisonDeals: DealWithRelations[] | null = null;
    if (aType === "COMP_ANALYSIS_PDF") {
      const compDealIds = body.comparisonDealIds as string[] | undefined;
      if (compDealIds && compDealIds.length > 0) {
        const deals = await prisma.deal.findMany({
          where: { id: { in: compDealIds }, orgId: auth.orgId },
          include: {
            parcels: { orderBy: { createdAt: "asc" } },
            jurisdiction: true,
          },
        });
        comparisonDeals = deals;
      }
    }

    // Create run record
    const run = await prisma.run.create({
      data: {
        orgId: auth.orgId,
        dealId: id,
        runType: "ARTIFACT_GEN",
        status: "running",
      },
    });

    try {
      // Build ArtifactSpec from deal data
      const spec = await buildArtifactSpec(aType, deal, triageOutput, comparisonDeals);

      // Render artifact
      const rendered = await renderArtifactFromSpec(spec);

      // Determine version
      const latestArtifact = await prisma.artifact.findFirst({
        where: { dealId: id, artifactType: aType },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latestArtifact?.version ?? 0) + 1;

      // Build storage key
      const storageObjectKey = buildArtifactObjectKey({
        orgId: auth.orgId,
        dealId: id,
        artifactType: aType,
        version: nextVersion,
        filename: rendered.filename,
      });

      // Upload to Supabase storage
      const { error: storageError } = await supabaseAdmin.storage
        .from("deal-room-uploads")
        .upload(storageObjectKey, Buffer.from(rendered.bytes), {
          contentType: rendered.contentType,
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      // Create artifact record
      const artifact = await prisma.artifact.create({
        data: {
          orgId: auth.orgId,
          dealId: id,
          artifactType: aType,
          version: nextVersion,
          storageObjectKey,
          generatedByRunId: run.id,
        },
      });

      // Update run as succeeded
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
        },
      });

      return NextResponse.json({ artifact, run: { id: run.id, status: "succeeded" } }, { status: 201 });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: errorMsg,
        },
      });
      console.error("Artifact generation failed:", error);
      return NextResponse.json(
        { error: "Artifact generation failed", detail: errorMsg },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error generating artifact:", error);
    return NextResponse.json(
      { error: "Failed to generate artifact" },
      { status: 500 }
    );
  }
}

// GET /api/deals/[id]/artifacts — list artifacts for a deal
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const artifacts = await prisma.artifact.findMany({
      where: { dealId: id, orgId: auth.orgId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ artifacts });
  } catch (error) {
    console.error("Error fetching artifacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch artifacts" },
      { status: 500 }
    );
  }
}

// --- LLM helper for narrative generation ---

async function generateNarrative(prompt: string, systemPrompt: string, maxTokens = 800): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "(LLM narrative generation unavailable — OPENAI_API_KEY not set)";

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? "(No narrative generated)";
  } catch (err) {
    console.error("[artifact-llm] narrative generation failed:", err instanceof Error ? err.message : String(err));
    return "(Narrative generation failed — see logs)";
  }
}

// --- Spec builders ---

interface DealWithRelations {
  id: string;
  name: string;
  sku: string;
  status: string;
  notes: string | null;
  jurisdiction: { id: string; name: string; kind: string; state: string } | null;
  parcels: Array<{
    id: string;
    address: string;
    apn: string | null;
    acreage: { toString(): string } | null;
    currentZoning: string | null;
    floodZone: string | null;
    soilsNotes: string | null;
    wetlandsNotes: string | null;
    envNotes: string | null;
    trafficNotes: string | null;
    utilitiesNotes: string | null;
  }>;
}

function buildParcelSummary(parcels: DealWithRelations["parcels"]): string {
  return parcels
    .map((p, i) => {
      const parts = [`**Parcel ${i + 1}:** ${p.address}`];
      if (p.apn) parts.push(`APN: ${p.apn}`);
      if (p.acreage) parts.push(`Acreage: ${p.acreage.toString()}`);
      if (p.currentZoning) parts.push(`Zoning: ${p.currentZoning}`);
      if (p.floodZone) parts.push(`Flood Zone: ${p.floodZone}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function buildDetailedParcelSummary(parcels: DealWithRelations["parcels"]): string {
  return parcels
    .map((p, i) => {
      const lines = [`**Parcel ${i + 1}: ${p.address}**`];
      if (p.apn) lines.push(`- APN: ${p.apn}`);
      if (p.acreage) lines.push(`- Acreage: ${p.acreage.toString()}`);
      if (p.currentZoning) lines.push(`- Current Zoning: ${p.currentZoning}`);
      if (p.floodZone) lines.push(`- Flood Zone: ${p.floodZone}`);
      if (p.soilsNotes) lines.push(`- Soils: ${p.soilsNotes}`);
      if (p.wetlandsNotes) lines.push(`- Wetlands: ${p.wetlandsNotes}`);
      if (p.envNotes) lines.push(`- Environmental: ${p.envNotes}`);
      if (p.trafficNotes) lines.push(`- Traffic: ${p.trafficNotes}`);
      if (p.utilitiesNotes) lines.push(`- Utilities: ${p.utilitiesNotes}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function totalAcreage(parcels: DealWithRelations["parcels"]): string {
  const sum = parcels.reduce((acc, p) => acc + (p.acreage ? parseFloat(p.acreage.toString()) : 0), 0);
  return sum > 0 ? sum.toFixed(2) : "N/A";
}

async function buildArtifactSpec(
  artifactType: ArtifactType,
  deal: DealWithRelations & { jurisdictionId?: string },
  triageOutput: Record<string, unknown> | null,
  comparisonDeals?: DealWithRelations[] | null
): Promise<ArtifactSpec> {
  const base = {
    schema_version: "1.0" as const,
    deal_id: deal.id,
    title: `${deal.name} - ${artifactTypeLabel(artifactType)}`,
    sources_summary: [] as string[],
  };

  switch (artifactType) {
    case "TRIAGE_PDF": {
      const triage = triageOutput!;
      const sections = [
        {
          key: "executive_summary",
          heading: "Executive Summary",
          body_markdown: buildTriageExecutiveSummary(deal, triage),
        },
        {
          key: "property_overview",
          heading: "Property Overview",
          body_markdown: buildDetailedParcelSummary(deal.parcels),
        },
        {
          key: "scorecard",
          heading: "Triage Scorecard",
          body_markdown: buildTriageScorecard(triage),
        },
        {
          key: "risk_scores",
          heading: "Risk Assessment",
          body_markdown: formatRiskScores(triage),
        },
        {
          key: "disqualifiers",
          heading: "Disqualifiers",
          body_markdown: formatDisqualifiers(triage),
        },
        {
          key: "financial_snapshot",
          heading: "Financial Snapshot",
          body_markdown: buildFinancialSnapshot(deal, triage),
        },
        {
          key: "next_actions",
          heading: "Recommended Next Steps",
          body_markdown: formatNextActions(triage),
        },
      ];
      return { ...base, artifact_type: "TRIAGE_PDF", sections };
    }

    case "SUBMISSION_CHECKLIST_PDF": {
      const jurisdiction = deal.jurisdiction?.name ?? "Unknown Jurisdiction";
      const seedSources = deal.jurisdictionId
        ? await prisma.jurisdictionSeedSource.findMany({
            where: { jurisdictionId: deal.jurisdictionId, active: true },
            select: { purpose: true, url: true },
          })
        : [];
      const sourcesByPurpose: Record<string, string[]> = {};
      for (const s of seedSources) {
        if (!sourcesByPurpose[s.purpose]) sourcesByPurpose[s.purpose] = [];
        sourcesByPurpose[s.purpose].push(s.url);
      }
      const appUrl = sourcesByPurpose["applications"]?.[0] ?? sourcesByPurpose["forms"]?.[0];
      const ordUrl = sourcesByPurpose["ordinance"]?.[0];
      return {
        ...base,
        artifact_type: "SUBMISSION_CHECKLIST_PDF",
        checklist_items: [
          { item: "Application Form", required: true, notes: `${jurisdiction} application form`, sources: appUrl ? [appUrl] : [] },
          { item: "Site Plan", required: true, notes: "Prepared by licensed surveyor/engineer", sources: [] },
          { item: "Legal Description", required: true, notes: "From title report or survey", sources: [] },
          { item: "Ownership Documentation", required: true, notes: "Deed, purchase agreement, or authorization letter", sources: [] },
          { item: "Environmental Assessment", required: false, notes: "Phase I ESA if available", sources: [] },
          { item: "Traffic Impact Analysis", required: false, notes: `Required if TIA threshold is met per ${jurisdiction} standards`, sources: ordUrl ? [ordUrl] : [] },
          { item: "Stormwater Management Plan", required: true, notes: "Per parish/city drainage requirements", sources: ordUrl ? [ordUrl] : [] },
        ],
        sections: [
          {
            key: "deal_overview",
            heading: "Deal Overview",
            body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Jurisdiction:** ${jurisdiction}\n\n${buildParcelSummary(deal.parcels)}`,
          },
        ],
      };
    }

    case "HEARING_DECK_PPTX": {
      const triage = triageOutput!;
      return {
        ...base,
        artifact_type: "HEARING_DECK_PPTX",
        slides: [
          { slide_no: 1, title: "Project Overview", bullets: [`Deal: ${deal.name}`, `Product: ${deal.sku}`, `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}`], speaker_notes: "Introduce the project and development team." },
          { slide_no: 2, title: "Site Location", bullets: deal.parcels.map((p) => `${p.address}${p.apn ? ` (APN: ${p.apn})` : ""}`), speaker_notes: "Walk through site location and access points." },
          { slide_no: 3, title: "Proposed Use", bullets: [`Primary use: ${deal.sku}`, "Consistent with comprehensive plan", "Compatible with surrounding uses"], speaker_notes: "Explain the proposed use and compatibility." },
          { slide_no: 4, title: "Zoning Analysis", bullets: deal.parcels.map((p) => `${p.address}: ${p.currentZoning ?? "TBD"}`), speaker_notes: "Review current vs requested zoning." },
          { slide_no: 5, title: "Site Conditions", bullets: deal.parcels.flatMap((p) => [p.floodZone ? `Flood: ${p.floodZone}` : null, p.soilsNotes ? `Soils: ${p.soilsNotes}` : null].filter(Boolean) as string[]).slice(0, 5) || ["No significant conditions identified"], speaker_notes: "Address environmental and physical site conditions." },
          { slide_no: 6, title: "Risk Assessment", bullets: [`Decision: ${String(triage.decision ?? "N/A")}`, `Key risks identified in triage assessment`], speaker_notes: "Summarize the risk profile from triage." },
          { slide_no: 7, title: "Infrastructure & Access", bullets: ["Road access and traffic analysis", "Utility availability", "Stormwater management approach"], speaker_notes: "Review infrastructure readiness." },
          { slide_no: 8, title: "Community Impact", bullets: ["Employment opportunities", "Tax revenue generation", "Minimal residential disruption"], speaker_notes: "Highlight positive community impacts." },
          { slide_no: 9, title: "Conditions & Commitments", bullets: ["Landscape buffers per code", "Hours of operation restrictions if applicable", "Stormwater compliance"], speaker_notes: "Address potential conditions the board may impose." },
          { slide_no: 10, title: "Request", bullets: [`Requesting approval for ${deal.sku} use`, "Project meets all applicable standards", "Respectfully request favorable recommendation"], speaker_notes: "Make the formal request and close." },
        ],
        sections: [],
      };
    }

    case "EXIT_PACKAGE_PDF": {
      const triage = triageOutput!;
      const latestTriagePdf = await prisma.artifact.findFirst({
        where: { dealId: deal.id, artifactType: "TRIAGE_PDF" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const triageUrl = latestTriagePdf
        ? `/api/deals/${deal.id}/artifacts/${latestTriagePdf.id}/download`
        : null;
      return {
        ...base,
        artifact_type: "EXIT_PACKAGE_PDF",
        approval_summary: `Deal "${deal.name}" received entitlement approval. Decision from triage: ${String(triage.decision ?? "N/A")}.`,
        conditions_summary: "See approval documentation for specific conditions of approval.",
        evidence_index: [
          { label: "Triage Assessment", url: triageUrl ?? "", notes: "Auto-generated triage report" },
        ],
        sections: [
          {
            key: "deal_overview",
            heading: "Deal Overview",
            body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Status:** ${deal.status}\n\n${buildParcelSummary(deal.parcels)}`,
          },
        ],
      };
    }

    case "BUYER_TEASER_PDF": {
      const triage = triageOutput;
      const acreage = totalAcreage(deal.parcels);
      const zonings = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))].join(", ") || "See Details";
      return {
        ...base,
        artifact_type: "BUYER_TEASER_PDF",
        sections: [
          {
            key: "opportunity",
            heading: "Investment Opportunity",
            body_markdown: [
              `**${deal.name}**`,
              `Product Type: ${skuLabel(deal.sku)}`,
              `Jurisdiction: ${deal.jurisdiction?.name ?? "Louisiana"}`,
              `Total Acreage: ${acreage} acres`,
              `Zoning: ${zonings}`,
              "",
              `Entitled ${skuLabel(deal.sku).toLowerCase()} opportunity with all approvals in place.`,
              triage ? `\nTriage Recommendation: **${String(triage.decision ?? "N/A")}** (Confidence: ${String(triage.confidence ?? "N/A")})` : "",
            ].filter(Boolean).join("\n"),
          },
          {
            key: "highlights",
            heading: "Investment Highlights",
            body_markdown: buildInvestmentHighlights(deal, triage),
          },
          {
            key: "site",
            heading: "Site Details",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          {
            key: "contact",
            heading: "Contact",
            body_markdown: "For more information, contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
      };
    }

    case "INVESTMENT_MEMO_PDF": {
      const triage = triageOutput!;
      const dealContext = buildDealContextForLLM(deal, triage);

      // Generate narrative sections via LLM in parallel
      const systemPrompt = "You are a senior CRE investment analyst at Gallagher Property Company, writing an institutional-quality investment memorandum. Write in professional third-person prose. Be specific and data-driven. Use the provided deal data — never fabricate numbers.";

      const [execSummary, investmentThesis, marketAnalysis, financialAnalysis, riskNarrative, businessPlan] = await Promise.all([
        generateNarrative(
          `Write a 2-3 paragraph executive summary for this deal:\n\n${dealContext}\n\nCover: what the opportunity is, why it's compelling, key metrics, and recommended action.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write the investment thesis (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nExplain: why this property fits GPC's strategy, market tailwinds, competitive advantages, and value creation opportunity.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write a market analysis section (3-4 paragraphs) for this deal:\n\n${dealContext}\n\nCover: local market dynamics in ${deal.jurisdiction?.name ?? "Louisiana"}, supply/demand for ${skuLabel(deal.sku)}, comparable transactions, demographic and economic drivers. Use available parcel and enrichment data.`,
          systemPrompt,
          600
        ),
        generateNarrative(
          `Write a financial analysis section (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: acquisition basis, estimated development costs, projected NOI, return metrics (cap rate, IRR, equity multiple), and how returns compare to target thresholds. Note any missing data.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write a risk assessment narrative (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: key risks identified in triage, environmental considerations, entitlement risk, market risk, and proposed mitigants.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write a development/business plan section (2-3 paragraphs) for this deal:\n\n${dealContext}\n\nCover: development timeline, entitlement strategy, site improvements needed, lease-up/disposition strategy.`,
          systemPrompt,
          400
        ),
      ]);

      return {
        ...base,
        artifact_type: "INVESTMENT_MEMO_PDF",
        sections: [
          { key: "exec_summary", heading: "Executive Summary", body_markdown: execSummary },
          { key: "investment_thesis", heading: "Investment Thesis", body_markdown: investmentThesis },
          {
            key: "property_description",
            heading: "Property Description",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          { key: "market_analysis", heading: "Market Analysis", body_markdown: marketAnalysis },
          { key: "financial_analysis", heading: "Financial Analysis", body_markdown: financialAnalysis },
          {
            key: "financial_snapshot",
            heading: "Financial Data",
            body_markdown: buildFinancialSnapshot(deal, triage),
          },
          { key: "risk_assessment", heading: "Risk Assessment", body_markdown: riskNarrative },
          {
            key: "risk_data",
            heading: "Risk Scores",
            body_markdown: formatRiskScores(triage) + "\n\n" + formatDisqualifiers(triage),
          },
          { key: "business_plan", heading: "Development / Business Plan", body_markdown: businessPlan },
          {
            key: "deal_structure",
            heading: "Deal Structure",
            body_markdown: `**Product:** ${skuLabel(deal.sku)}\n**Jurisdiction:** ${deal.jurisdiction?.name ?? "N/A"}\n**Status:** ${deal.status}\n**Triage Decision:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}`,
          },
          {
            key: "next_steps",
            heading: "Recommended Next Steps",
            body_markdown: formatNextActions(triage),
          },
        ],
      };
    }

    case "OFFERING_MEMO_PDF": {
      const triage = triageOutput!;
      const dealContext = buildDealContextForLLM(deal, triage);
      const systemPrompt = "You are a CRE marketing specialist at Gallagher Property Company, writing a professional offering memorandum to attract institutional buyers and investors. Write in polished marketing language that is factual and compelling. Use provided data — never fabricate.";

      const [execSummary, locationNarrative, marketOverview, incomeAnalysis] = await Promise.all([
        generateNarrative(
          `Write an executive summary (2-3 paragraphs) for this offering:\n\n${dealContext}\n\nHighlight: the opportunity, key investment metrics, entitlement status, and strategic value.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write a location analysis section (2-3 paragraphs):\n\n${dealContext}\n\nDescribe: the property location in ${deal.jurisdiction?.name ?? "Louisiana"}, access and visibility, surrounding uses, proximity to infrastructure and economic drivers.`,
          systemPrompt,
          400
        ),
        generateNarrative(
          `Write a market overview section (2-3 paragraphs):\n\n${dealContext}\n\nCover: ${skuLabel(deal.sku)} market dynamics in the area, vacancy rates, absorption trends, comparable lease rates, and growth outlook.`,
          systemPrompt,
          500
        ),
        generateNarrative(
          `Write an income/financial analysis section (2-3 paragraphs):\n\n${dealContext}\n\nAddress: current or projected income, expense structure, NOI, cap rate, and return potential for a buyer.`,
          systemPrompt,
          400
        ),
      ]);

      return {
        ...base,
        artifact_type: "OFFERING_MEMO_PDF",
        sections: [
          { key: "confidentiality", heading: "Confidentiality Notice", body_markdown: "This Offering Memorandum is provided solely for the purpose of evaluating the acquisition of the property described herein. By accepting this document, the recipient agrees to maintain the confidentiality of its contents." },
          { key: "exec_summary", heading: "Executive Summary", body_markdown: execSummary },
          {
            key: "property_description",
            heading: "Property Description",
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
          { key: "location", heading: "Location Analysis", body_markdown: locationNarrative },
          { key: "income_analysis", heading: "Financial Analysis", body_markdown: incomeAnalysis },
          {
            key: "financial_data",
            heading: "Financial Data",
            body_markdown: buildFinancialSnapshot(deal, triage),
          },
          { key: "market_overview", heading: "Market Overview", body_markdown: marketOverview },
          {
            key: "entitlement_status",
            heading: "Entitlement Status",
            body_markdown: `**Current Status:** ${deal.status}\n**Triage Decision:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}\n\n${formatNextActions(triage)}`,
          },
          {
            key: "risk_summary",
            heading: "Risk Summary",
            body_markdown: formatRiskScores(triage),
          },
          {
            key: "site_conditions",
            heading: "Site Conditions & Environmental",
            body_markdown: deal.parcels.map((p) => {
              const items: string[] = [];
              if (p.floodZone) items.push(`Flood Zone: ${p.floodZone}`);
              if (p.soilsNotes) items.push(`Soils: ${p.soilsNotes}`);
              if (p.wetlandsNotes) items.push(`Wetlands: ${p.wetlandsNotes}`);
              if (p.envNotes) items.push(`Environmental: ${p.envNotes}`);
              return items.length > 0 ? `**${p.address}**\n${items.map((i) => `- ${i}`).join("\n")}` : `**${p.address}**: No significant conditions noted.`;
            }).join("\n\n"),
          },
          {
            key: "contact",
            heading: "Contact Information",
            body_markdown: "For additional information or to schedule a site visit, please contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
      };
    }

    case "COMP_ANALYSIS_PDF": {
      const triage = triageOutput!;
      const allDeals = [deal, ...(comparisonDeals ?? [])];

      // Build comparison items
      const comparisonItems = allDeals.map((d) => {
        const acreage = totalAcreage(d.parcels);
        const zonings = [...new Set(d.parcels.map((p) => p.currentZoning).filter(Boolean))].join(", ") || "N/A";
        const floods = [...new Set(d.parcels.map((p) => p.floodZone).filter(Boolean))].join(", ") || "N/A";
        const addresses = d.parcels.map((p) => p.address).join("; ") || "N/A";

        return {
          label: d.name,
          address: addresses,
          metrics: {
            "Product Type": skuLabel(d.sku),
            "Jurisdiction": d.jurisdiction?.name ?? "N/A",
            "Total Acreage": acreage,
            "Zoning": zonings,
            "Flood Zone": floods,
            "Status": d.status,
            "Parcel Count": String(d.parcels.length),
          },
        };
      });

      // Generate AI recommendation
      const compContext = allDeals.map((d) => {
        return `${d.name}: ${skuLabel(d.sku)}, ${totalAcreage(d.parcels)} acres, ${d.jurisdiction?.name ?? "N/A"}, Status: ${d.status}, Parcels: ${d.parcels.length}`;
      }).join("\n");

      const recommendation = await generateNarrative(
        `Compare these ${allDeals.length} deals and provide a recommendation on which represents the best opportunity for a ${skuLabel(deal.sku)} investment:\n\n${compContext}\n\nPrimary deal triage: Decision=${String(triage.decision)}, Confidence=${String(triage.confidence)}\n\nProvide a 2-3 paragraph recommendation covering relative strengths and weaknesses, and which deal (or combination) is most compelling.`,
        "You are a CRE investment analyst at Gallagher Property Company. Provide an objective comparison and recommendation based on available data. Be specific about trade-offs.",
        500
      );

      return {
        ...base,
        artifact_type: "COMP_ANALYSIS_PDF",
        comparison_items: comparisonItems,
        recommendation,
        sections: [
          {
            key: "overview",
            heading: "Analysis Overview",
            body_markdown: `This comparative analysis evaluates ${allDeals.length} ${skuLabel(deal.sku)} opportunit${allDeals.length === 1 ? "y" : "ies"} across ${[...new Set(allDeals.map((d) => d.jurisdiction?.name).filter(Boolean))].join(", ") || "Louisiana"}.\n\n**Primary Deal:** ${deal.name}\n**Comparison Deals:** ${comparisonDeals?.map((d) => d.name).join(", ") || "None (single-deal analysis)"}`,
          },
          {
            key: "primary_detail",
            heading: `Primary Deal: ${deal.name}`,
            body_markdown: buildDetailedParcelSummary(deal.parcels),
          },
        ],
      };
    }
  }
}

// --- Helper functions ---

function artifactTypeLabel(t: ArtifactType): string {
  const labels: Record<ArtifactType, string> = {
    TRIAGE_PDF: "Triage Report",
    SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
    HEARING_DECK_PPTX: "Hearing Deck",
    EXIT_PACKAGE_PDF: "Exit Package",
    BUYER_TEASER_PDF: "Buyer Teaser",
    INVESTMENT_MEMO_PDF: "Investment Memo",
    OFFERING_MEMO_PDF: "Offering Memorandum",
    COMP_ANALYSIS_PDF: "Comparative Analysis",
  };
  return labels[t];
}

function skuLabel(sku: string): string {
  const labels: Record<string, string> = {
    SMALL_BAY_FLEX: "Small Bay Flex",
    OUTDOOR_STORAGE: "Outdoor Storage",
    TRUCK_PARKING: "Truck Parking",
  };
  return labels[sku] ?? sku;
}

function formatRiskScores(triage: Record<string, unknown>): string {
  const scores = triage.risk_scores as Record<string, number> | undefined;
  if (!scores || typeof scores !== "object") return "No risk scores available.";
  return Object.entries(scores)
    .map(([key, val]) => `**${key.replace(/_/g, " ")}:** ${val}/10`)
    .join("\n");
}

function formatDisqualifiers(triage: Record<string, unknown>): string {
  const hard = triage.hard_disqualifiers as string[] | undefined;
  const soft = triage.soft_disqualifiers as string[] | undefined;
  const parts: string[] = [];
  if (hard && hard.length > 0) {
    parts.push("**Hard Disqualifiers:**\n" + hard.map((d) => `- ${d}`).join("\n"));
  } else {
    parts.push("**Hard Disqualifiers:** None");
  }
  if (soft && soft.length > 0) {
    parts.push("**Soft Disqualifiers:**\n" + soft.map((d) => `- ${d}`).join("\n"));
  } else {
    parts.push("**Soft Disqualifiers:** None");
  }
  return parts.join("\n\n");
}

function formatNextActions(triage: Record<string, unknown>): string {
  const actions = triage.next_actions as Array<{ title: string; description?: string }> | undefined;
  if (!actions || actions.length === 0) return "No next actions specified.";
  return actions.map((a, i) => `${i + 1}. **${a.title}**${a.description ? `: ${a.description}` : ""}`).join("\n");
}

function buildTriageExecutiveSummary(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const decision = String(triage.decision ?? "N/A");
  const confidence = String(triage.confidence ?? "N/A");
  const rationale = String(triage.rationale ?? "");
  const acreage = totalAcreage(deal.parcels);
  return [
    `**Deal:** ${deal.name}`,
    `**Product:** ${skuLabel(deal.sku)}`,
    `**Location:** ${deal.jurisdiction?.name ?? "Louisiana"}`,
    `**Total Acreage:** ${acreage} acres`,
    `**Triage Recommendation:** ${decision} (Confidence: ${confidence})`,
    "",
    rationale,
  ].join("\n");
}

function buildTriageScorecard(triage: Record<string, unknown>): string {
  const scores = triage.risk_scores as Record<string, number> | undefined;
  if (!scores || typeof scores !== "object") return "No scorecard data available.";

  const entries = Object.entries(scores);
  const avg = entries.length > 0 ? entries.reduce((sum, [, v]) => sum + v, 0) / entries.length : 0;

  const lines = [
    `**Overall Score:** ${avg.toFixed(1)}/10`,
    "",
    "**Category Breakdown:**",
    ...entries.map(([key, val]) => {
      const bar = val >= 7 ? "LOW RISK" : val >= 4 ? "MODERATE" : "HIGH RISK";
      return `- ${key.replace(/_/g, " ")}: ${val}/10 (${bar})`;
    }),
  ];
  return lines.join("\n");
}

function buildFinancialSnapshot(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  const acreage = totalAcreage(deal.parcels);

  const lines = [
    `**Product Type:** ${skuLabel(deal.sku)}`,
    `**Total Acreage:** ${acreage} acres`,
  ];

  if (financials && typeof financials === "object") {
    if (financials.acquisition_cost) lines.push(`**Estimated Acquisition Cost:** ${String(financials.acquisition_cost)}`);
    if (financials.estimated_noi) lines.push(`**Estimated NOI:** ${String(financials.estimated_noi)}`);
    if (financials.projected_cap_rate) lines.push(`**Projected Cap Rate:** ${String(financials.projected_cap_rate)}`);
    if (financials.estimated_irr) lines.push(`**Estimated IRR:** ${String(financials.estimated_irr)}`);
    if (financials.total_development_cost) lines.push(`**Total Development Cost:** ${String(financials.total_development_cost)}`);
    if (financials.equity_multiple) lines.push(`**Equity Multiple:** ${String(financials.equity_multiple)}`);
  } else {
    lines.push(
      "",
      "*Financial data will be populated as deal analysis progresses. Run financial modeling tools for detailed projections.*"
    );
  }

  return lines.join("\n");
}

function buildInvestmentHighlights(deal: DealWithRelations, triage: Record<string, unknown> | null): string {
  const highlights: string[] = [];
  const acreage = totalAcreage(deal.parcels);

  if (parseFloat(acreage) > 0) highlights.push(`${acreage} acres of developable land`);
  if (deal.jurisdiction) highlights.push(`Located in ${deal.jurisdiction.name}, ${deal.jurisdiction.state}`);
  highlights.push(`${skuLabel(deal.sku)} product type`);
  if (deal.status === "APPROVED" || deal.status === "EXIT_MARKETED") highlights.push("Fully entitled — all approvals in place");

  if (triage) {
    const decision = String(triage.decision ?? "");
    if (decision === "ADVANCE") highlights.push("Passed triage screening with ADVANCE recommendation");
    const confidence = triage.confidence as number | undefined;
    if (confidence && confidence >= 0.7) highlights.push(`High confidence triage score (${(confidence * 100).toFixed(0)}%)`);
  }

  const zonings = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))];
  if (zonings.length > 0) highlights.push(`Zoned: ${zonings.join(", ")}`);

  return highlights.map((h) => `- ${h}`).join("\n");
}

function buildDealContextForLLM(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const parts: string[] = [
    `Deal Name: ${deal.name}`,
    `Product Type: ${skuLabel(deal.sku)}`,
    `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}, ${deal.jurisdiction?.state ?? "LA"}`,
    `Status: ${deal.status}`,
    `Parcels: ${deal.parcels.length}`,
    `Total Acreage: ${totalAcreage(deal.parcels)} acres`,
    "",
    "Parcel Details:",
    buildDetailedParcelSummary(deal.parcels),
    "",
    `Triage Decision: ${String(triage.decision ?? "N/A")}`,
    `Triage Confidence: ${String(triage.confidence ?? "N/A")}`,
    `Triage Rationale: ${String(triage.rationale ?? "N/A")}`,
    "",
    "Risk Scores:",
    formatRiskScores(triage),
    "",
    "Disqualifiers:",
    formatDisqualifiers(triage),
  ];

  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  if (financials && typeof financials === "object") {
    parts.push("", "Financial Data:");
    for (const [k, v] of Object.entries(financials)) {
      parts.push(`${k}: ${String(v)}`);
    }
  }

  if (deal.notes) {
    parts.push("", `Notes: ${deal.notes}`);
  }

  return parts.join("\n");
}
