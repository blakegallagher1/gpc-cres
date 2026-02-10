import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import {
  DEAL_STATUSES,
  buildArtifactObjectKey,
} from "@entitlement-os/shared";
import type { ArtifactType, DealStatus, ArtifactSpec } from "@entitlement-os/shared";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Stage prerequisites (must match the route in apps/web)
// ---------------------------------------------------------------------------

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
  const ci = DEAL_STATUSES.indexOf(current as DealStatus);
  const ri = DEAL_STATUSES.indexOf(required);
  if (ci < 0) return false;
  return ci >= ri;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const generate_artifact = tool({
  name: "generate_artifact",
  description:
    "Generate a professional document (PDF or PPTX) for a deal and store it. Supports: TRIAGE_PDF, SUBMISSION_CHECKLIST_PDF, HEARING_DECK_PPTX, EXIT_PACKAGE_PDF, BUYER_TEASER_PDF, INVESTMENT_MEMO_PDF, OFFERING_MEMO_PDF, COMP_ANALYSIS_PDF. The deal must meet the stage prerequisite for the requested type. Returns artifact ID, version, and download URL on success.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID to generate artifact for"),
    artifactType: z
      .enum([
        "TRIAGE_PDF",
        "SUBMISSION_CHECKLIST_PDF",
        "HEARING_DECK_PPTX",
        "EXIT_PACKAGE_PDF",
        "BUYER_TEASER_PDF",
        "INVESTMENT_MEMO_PDF",
        "OFFERING_MEMO_PDF",
        "COMP_ANALYSIS_PDF",
      ])
      .describe("Type of artifact to generate"),
    comparisonDealIds: z
      .array(z.string().uuid())
      .nullable()
      .describe("For COMP_ANALYSIS_PDF only: IDs of deals to compare against. Null for other types."),
  }),
  execute: async ({ orgId, dealId, artifactType, comparisonDealIds }) => {
    try {
      const aType = artifactType as ArtifactType;

      // Load deal with relations
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, orgId },
        include: {
          parcels: { orderBy: { createdAt: "asc" } },
          jurisdiction: true,
        },
      });
      if (!deal) {
        return JSON.stringify({ error: "Deal not found or access denied" });
      }

      // Stage prerequisite check
      const required = STAGE_PREREQUISITES[aType];
      if (!isAtOrPast(deal.status, required)) {
        return JSON.stringify({
          error: `Deal must be at ${required} or later to generate ${aType}. Current status: ${deal.status}`,
        });
      }

      // Load triage output if needed
      let triageOutput: Record<string, unknown> | null = null;
      const requiresTriage: ArtifactType[] = [
        "TRIAGE_PDF",
        "HEARING_DECK_PPTX",
        "EXIT_PACKAGE_PDF",
        "INVESTMENT_MEMO_PDF",
        "OFFERING_MEMO_PDF",
        "COMP_ANALYSIS_PDF",
      ];
      if (requiresTriage.includes(aType)) {
        const triageRun = await prisma.run.findFirst({
          where: { dealId, orgId, runType: "TRIAGE", status: "succeeded" },
          orderBy: { startedAt: "desc" },
          select: { outputJson: true },
        });
        if (!triageRun?.outputJson) {
          return JSON.stringify({
            error: `A successful triage run is required to generate ${aType}`,
          });
        }
        triageOutput = triageRun.outputJson as Record<string, unknown>;
      }

      // Load comparison deals for COMP_ANALYSIS_PDF
      let compDeals: DealWithRelations[] | null = null;
      if (aType === "COMP_ANALYSIS_PDF" && comparisonDealIds?.length) {
        compDeals = await prisma.deal.findMany({
          where: { id: { in: comparisonDealIds }, orgId },
          include: {
            parcels: { orderBy: { createdAt: "asc" } },
            jurisdiction: true,
          },
        });
      }

      // Create run record
      const run = await prisma.run.create({
        data: { orgId, dealId, runType: "ARTIFACT_GEN", status: "running" },
      });

      try {
        // Build artifact spec
        const spec = await buildArtifactSpec(aType, deal, triageOutput, compDeals);

        // Render
        const rendered = await renderArtifactFromSpec(spec);

        // Determine next version
        const latest = await prisma.artifact.findFirst({
          where: { dealId, artifactType: aType },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;

        // Build storage key
        const storageObjectKey = buildArtifactObjectKey({
          orgId,
          dealId,
          artifactType: aType,
          version: nextVersion,
          filename: rendered.filename,
        });

        // Upload to Supabase storage
        const supabase = createClient(
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
          process.env.SUPABASE_SERVICE_ROLE_KEY || ""
        );
        const { error: storageError } = await supabase.storage
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
            orgId,
            dealId,
            artifactType: aType,
            version: nextVersion,
            storageObjectKey,
            generatedByRunId: run.id,
          },
        });

        // Create notification for org members
        await createArtifactNotification(
          orgId,
          dealId,
          deal.name,
          aType,
          nextVersion,
          artifact.id
        );

        // Mark run succeeded
        await prisma.run.update({
          where: { id: run.id },
          data: { status: "succeeded", finishedAt: new Date() },
        });

        return JSON.stringify({
          success: true,
          artifactId: artifact.id,
          artifactType: aType,
          version: nextVersion,
          downloadUrl: `/api/deals/artifacts/${artifact.id}/download`,
          message: `${LABELS[aType]} v${nextVersion} generated successfully for "${deal.name}"`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await prisma.run.update({
          where: { id: run.id },
          data: { status: "failed", finishedAt: new Date(), error: msg },
        });
        return JSON.stringify({ error: `Artifact generation failed: ${msg}` });
      }
    } catch (error) {
      return JSON.stringify({
        error: `Failed to generate artifact: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Shared types & labels
// ---------------------------------------------------------------------------

interface DealWithRelations {
  id: string;
  name: string;
  sku: string;
  status: string;
  notes: string | null;
  jurisdictionId?: string | null;
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

const LABELS: Record<ArtifactType, string> = {
  TRIAGE_PDF: "Triage Report",
  SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
  HEARING_DECK_PPTX: "Hearing Deck",
  EXIT_PACKAGE_PDF: "Exit Package",
  BUYER_TEASER_PDF: "Buyer Teaser",
  INVESTMENT_MEMO_PDF: "Investment Memo",
  OFFERING_MEMO_PDF: "Offering Memorandum",
  COMP_ANALYSIS_PDF: "Comparative Analysis",
};

const SKU_LABELS: Record<string, string> = {
  SMALL_BAY_FLEX: "Small Bay Flex",
  OUTDOOR_STORAGE: "Outdoor Storage",
  TRUCK_PARKING: "Truck Parking",
};

// ---------------------------------------------------------------------------
// LLM narrative generation
// ---------------------------------------------------------------------------

async function generateNarrative(
  prompt: string,
  systemPrompt: string,
  maxTokens = 800
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "(Narrative unavailable — OPENAI_API_KEY not set)";
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
    console.error(
      "[artifact-tool] narrative generation failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "(Narrative generation failed — see logs)";
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function createArtifactNotification(
  orgId: string,
  dealId: string,
  dealName: string,
  artifactType: ArtifactType,
  version: number,
  artifactId: string
): Promise<void> {
  try {
    const members = await prisma.orgMembership.findMany({
      where: { orgId },
      select: { userId: true },
    });
    if (members.length === 0) return;

    await prisma.notification.createMany({
      data: members.map((m) => ({
        orgId,
        userId: m.userId,
        dealId,
        type: "AUTOMATION" as never,
        title: `${LABELS[artifactType]} Generated`,
        body: `${LABELS[artifactType]} v${version} has been generated for "${dealName}".`,
        metadata: {
          automationType: "artifact_generated",
          artifactId,
          artifactType,
          version,
        },
        priority: "LOW" as never,
        actionUrl: `/deals/${dealId}`,
        sourceAgent: "automation",
      })),
    });
  } catch (err) {
    console.error(
      "[artifact-tool] notification creation failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// Parcel helpers
// ---------------------------------------------------------------------------

function parcelSummary(parcels: DealWithRelations["parcels"]): string {
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

function detailedParcelSummary(parcels: DealWithRelations["parcels"]): string {
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
  const sum = parcels.reduce(
    (acc, p) => acc + (p.acreage ? parseFloat(p.acreage.toString()) : 0),
    0
  );
  return sum > 0 ? sum.toFixed(2) : "N/A";
}

function skuLabel(sku: string): string {
  return SKU_LABELS[sku] ?? sku;
}

// ---------------------------------------------------------------------------
// Triage helpers
// ---------------------------------------------------------------------------

function fmtRiskScores(triage: Record<string, unknown>): string {
  const scores = triage.risk_scores as Record<string, number> | undefined;
  if (!scores || typeof scores !== "object") return "No risk scores available.";
  return Object.entries(scores)
    .map(([k, v]) => `**${k.replace(/_/g, " ")}:** ${v}/10`)
    .join("\n");
}

function fmtDisqualifiers(triage: Record<string, unknown>): string {
  const hard = triage.hard_disqualifiers as string[] | undefined;
  const soft = triage.soft_disqualifiers as string[] | undefined;
  const parts: string[] = [];
  parts.push(
    hard && hard.length > 0
      ? "**Hard Disqualifiers:**\n" + hard.map((d) => `- ${d}`).join("\n")
      : "**Hard Disqualifiers:** None"
  );
  parts.push(
    soft && soft.length > 0
      ? "**Soft Disqualifiers:**\n" + soft.map((d) => `- ${d}`).join("\n")
      : "**Soft Disqualifiers:** None"
  );
  return parts.join("\n\n");
}

function fmtNextActions(triage: Record<string, unknown>): string {
  const actions = triage.next_actions as Array<{ title: string; description?: string }> | undefined;
  if (!actions || actions.length === 0) return "No next actions specified.";
  return actions
    .map((a, i) => `${i + 1}. **${a.title}**${a.description ? `: ${a.description}` : ""}`)
    .join("\n");
}

function buildFinancialSnapshot(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  const lines = [
    `**Product Type:** ${skuLabel(deal.sku)}`,
    `**Total Acreage:** ${totalAcreage(deal.parcels)} acres`,
  ];
  if (financials && typeof financials === "object") {
    for (const [k, v] of Object.entries(financials)) {
      if (v) lines.push(`**${k.replace(/_/g, " ")}:** ${String(v)}`);
    }
  } else {
    lines.push("", "*Financial data will be populated as analysis progresses.*");
  }
  return lines.join("\n");
}

function buildDealContext(deal: DealWithRelations, triage: Record<string, unknown>): string {
  const parts = [
    `Deal Name: ${deal.name}`,
    `Product Type: ${skuLabel(deal.sku)}`,
    `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}, ${deal.jurisdiction?.state ?? "LA"}`,
    `Status: ${deal.status}`,
    `Total Acreage: ${totalAcreage(deal.parcels)} acres`,
    "",
    "Parcel Details:",
    detailedParcelSummary(deal.parcels),
    "",
    `Triage Decision: ${String(triage.decision ?? "N/A")}`,
    `Triage Confidence: ${String(triage.confidence ?? "N/A")}`,
    `Triage Rationale: ${String(triage.rationale ?? "N/A")}`,
    "",
    "Risk Scores:",
    fmtRiskScores(triage),
  ];
  const financials = triage.financial_summary as Record<string, unknown> | undefined;
  if (financials && typeof financials === "object") {
    parts.push("", "Financial Data:");
    for (const [k, v] of Object.entries(financials)) {
      parts.push(`${k}: ${String(v)}`);
    }
  }
  if (deal.notes) parts.push("", `Notes: ${deal.notes}`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Spec builder — all 8 artifact types
// ---------------------------------------------------------------------------

async function buildArtifactSpec(
  artifactType: ArtifactType,
  deal: DealWithRelations,
  triageOutput: Record<string, unknown> | null,
  comparisonDeals?: DealWithRelations[] | null
): Promise<ArtifactSpec> {
  const base = {
    schema_version: "1.0" as const,
    deal_id: deal.id,
    title: `${deal.name} - ${LABELS[artifactType]}`,
    sources_summary: [] as string[],
  };

  switch (artifactType) {
    case "TRIAGE_PDF": {
      const t = triageOutput!;
      const scores = t.risk_scores as Record<string, number> | undefined;
      const entries = scores ? Object.entries(scores) : [];
      const avg = entries.length > 0 ? entries.reduce((s, [, v]) => s + v, 0) / entries.length : 0;
      return {
        ...base,
        artifact_type: "TRIAGE_PDF",
        sections: [
          {
            key: "executive_summary",
            heading: "Executive Summary",
            body_markdown: [
              `**Deal:** ${deal.name}`,
              `**Product:** ${skuLabel(deal.sku)}`,
              `**Location:** ${deal.jurisdiction?.name ?? "Louisiana"}`,
              `**Total Acreage:** ${totalAcreage(deal.parcels)} acres`,
              `**Triage Recommendation:** ${String(t.decision ?? "N/A")} (Confidence: ${String(t.confidence ?? "N/A")})`,
              "",
              String(t.rationale ?? ""),
            ].join("\n"),
          },
          { key: "property_overview", heading: "Property Overview", body_markdown: detailedParcelSummary(deal.parcels) },
          {
            key: "scorecard",
            heading: "Triage Scorecard",
            body_markdown: [
              `**Overall Score:** ${avg.toFixed(1)}/10`,
              "",
              "**Category Breakdown:**",
              ...entries.map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}/10 (${v >= 7 ? "LOW RISK" : v >= 4 ? "MODERATE" : "HIGH RISK"})`),
            ].join("\n"),
          },
          { key: "risk_scores", heading: "Risk Assessment", body_markdown: fmtRiskScores(t) },
          { key: "disqualifiers", heading: "Disqualifiers", body_markdown: fmtDisqualifiers(t) },
          { key: "financial_snapshot", heading: "Financial Snapshot", body_markdown: buildFinancialSnapshot(deal, t) },
          { key: "next_actions", heading: "Recommended Next Steps", body_markdown: fmtNextActions(t) },
        ],
      };
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
            body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Jurisdiction:** ${jurisdiction}\n\n${parcelSummary(deal.parcels)}`,
          },
        ],
      };
    }

    case "HEARING_DECK_PPTX": {
      const t = triageOutput!;
      return {
        ...base,
        artifact_type: "HEARING_DECK_PPTX",
        slides: [
          { slide_no: 1, title: "Project Overview", bullets: [`Deal: ${deal.name}`, `Product: ${deal.sku}`, `Jurisdiction: ${deal.jurisdiction?.name ?? "N/A"}`], speaker_notes: "Introduce the project." },
          { slide_no: 2, title: "Site Location", bullets: deal.parcels.map((p) => `${p.address}${p.apn ? ` (APN: ${p.apn})` : ""}`), speaker_notes: "Walk through site location." },
          { slide_no: 3, title: "Proposed Use", bullets: [`Primary use: ${deal.sku}`, "Consistent with comprehensive plan", "Compatible with surrounding uses"], speaker_notes: "Explain proposed use." },
          { slide_no: 4, title: "Zoning Analysis", bullets: deal.parcels.map((p) => `${p.address}: ${p.currentZoning ?? "TBD"}`), speaker_notes: "Review current vs requested zoning." },
          { slide_no: 5, title: "Site Conditions", bullets: deal.parcels.flatMap((p) => [p.floodZone ? `Flood: ${p.floodZone}` : null, p.soilsNotes ? `Soils: ${p.soilsNotes}` : null].filter(Boolean) as string[]).slice(0, 5) || ["No significant conditions"], speaker_notes: "Address site conditions." },
          { slide_no: 6, title: "Risk Assessment", bullets: [`Decision: ${String(t.decision ?? "N/A")}`, "Key risks identified in triage"], speaker_notes: "Summarize risk profile." },
          { slide_no: 7, title: "Infrastructure & Access", bullets: ["Road access and traffic analysis", "Utility availability", "Stormwater management approach"], speaker_notes: "Review infrastructure." },
          { slide_no: 8, title: "Community Impact", bullets: ["Employment opportunities", "Tax revenue generation", "Minimal residential disruption"], speaker_notes: "Highlight positive impacts." },
          { slide_no: 9, title: "Conditions & Commitments", bullets: ["Landscape buffers per code", "Hours of operation restrictions if applicable", "Stormwater compliance"], speaker_notes: "Address conditions." },
          { slide_no: 10, title: "Request", bullets: [`Requesting approval for ${deal.sku} use`, "Project meets all applicable standards", "Respectfully request favorable recommendation"], speaker_notes: "Make the formal request." },
        ],
        sections: [],
      };
    }

    case "EXIT_PACKAGE_PDF": {
      const t = triageOutput!;
      const latestTriagePdf = await prisma.artifact.findFirst({
        where: { dealId: deal.id, artifactType: "TRIAGE_PDF" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      return {
        ...base,
        artifact_type: "EXIT_PACKAGE_PDF",
        approval_summary: `Deal "${deal.name}" received entitlement approval. Decision from triage: ${String(t.decision ?? "N/A")}.`,
        conditions_summary: "See approval documentation for specific conditions of approval.",
        evidence_index: [
          { label: "Triage Assessment", url: latestTriagePdf ? `/api/deals/artifacts/${latestTriagePdf.id}/download` : "", notes: "Auto-generated triage report" },
        ],
        sections: [
          {
            key: "deal_overview",
            heading: "Deal Overview",
            body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Status:** ${deal.status}\n\n${parcelSummary(deal.parcels)}`,
          },
        ],
      };
    }

    case "BUYER_TEASER_PDF": {
      const triage = triageOutput;
      const acreage = totalAcreage(deal.parcels);
      const zonings = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))].join(", ") || "See Details";
      const highlights: string[] = [];
      if (parseFloat(acreage) > 0) highlights.push(`${acreage} acres of developable land`);
      if (deal.jurisdiction) highlights.push(`Located in ${deal.jurisdiction.name}, ${deal.jurisdiction.state}`);
      highlights.push(`${skuLabel(deal.sku)} product type`);
      if (deal.status === "APPROVED" || deal.status === "EXIT_MARKETED") highlights.push("Fully entitled — all approvals in place");
      if (triage) {
        if (String(triage.decision) === "ADVANCE") highlights.push("Passed triage with ADVANCE recommendation");
      }
      const zoneList = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))];
      if (zoneList.length > 0) highlights.push(`Zoned: ${zoneList.join(", ")}`);

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
            ].join("\n"),
          },
          {
            key: "highlights",
            heading: "Investment Highlights",
            body_markdown: highlights.map((h) => `- ${h}`).join("\n"),
          },
          { key: "site", heading: "Site Details", body_markdown: detailedParcelSummary(deal.parcels) },
          {
            key: "contact",
            heading: "Contact",
            body_markdown: "For more information, contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
      };
    }

    case "INVESTMENT_MEMO_PDF": {
      const t = triageOutput!;
      const ctx = buildDealContext(deal, t);
      const sys = "You are a senior CRE investment analyst at Gallagher Property Company, writing an institutional-quality investment memorandum. Write in professional third-person prose. Be specific and data-driven. Use the provided deal data — never fabricate numbers.";

      const [execSummary, thesis, market, financial, risk, plan] = await Promise.all([
        generateNarrative(`Write a 2-3 paragraph executive summary for this deal:\n\n${ctx}\n\nCover: what the opportunity is, why it's compelling, key metrics, and recommended action.`, sys, 500),
        generateNarrative(`Write the investment thesis (2-3 paragraphs):\n\n${ctx}\n\nExplain: why this property fits GPC's strategy, market tailwinds, competitive advantages, and value creation opportunity.`, sys, 500),
        generateNarrative(`Write a market analysis (3-4 paragraphs):\n\n${ctx}\n\nCover: local market dynamics in ${deal.jurisdiction?.name ?? "Louisiana"}, supply/demand for ${skuLabel(deal.sku)}, comparable transactions, demographic and economic drivers.`, sys, 600),
        generateNarrative(`Write a financial analysis (2-3 paragraphs):\n\n${ctx}\n\nCover: acquisition basis, development costs, projected NOI, return metrics (cap rate, IRR, equity multiple), and how returns compare to targets.`, sys, 500),
        generateNarrative(`Write a risk assessment narrative (2-3 paragraphs):\n\n${ctx}\n\nCover: key risks from triage, environmental, entitlement risk, market risk, and proposed mitigants.`, sys, 500),
        generateNarrative(`Write a development/business plan section (2-3 paragraphs):\n\n${ctx}\n\nCover: development timeline, entitlement strategy, site improvements, lease-up/disposition strategy.`, sys, 400),
      ]);

      return {
        ...base,
        artifact_type: "INVESTMENT_MEMO_PDF",
        sections: [
          { key: "exec_summary", heading: "Executive Summary", body_markdown: execSummary },
          { key: "investment_thesis", heading: "Investment Thesis", body_markdown: thesis },
          { key: "property_description", heading: "Property Description", body_markdown: detailedParcelSummary(deal.parcels) },
          { key: "market_analysis", heading: "Market Analysis", body_markdown: market },
          { key: "financial_analysis", heading: "Financial Analysis", body_markdown: financial },
          { key: "financial_snapshot", heading: "Financial Data", body_markdown: buildFinancialSnapshot(deal, t) },
          { key: "risk_assessment", heading: "Risk Assessment", body_markdown: risk },
          { key: "risk_data", heading: "Risk Scores", body_markdown: fmtRiskScores(t) + "\n\n" + fmtDisqualifiers(t) },
          { key: "business_plan", heading: "Development / Business Plan", body_markdown: plan },
          {
            key: "deal_structure",
            heading: "Deal Structure",
            body_markdown: `**Product:** ${skuLabel(deal.sku)}\n**Jurisdiction:** ${deal.jurisdiction?.name ?? "N/A"}\n**Status:** ${deal.status}\n**Triage Decision:** ${String(t.decision ?? "N/A")}\n**Confidence:** ${String(t.confidence ?? "N/A")}`,
          },
          { key: "next_steps", heading: "Recommended Next Steps", body_markdown: fmtNextActions(t) },
        ],
      };
    }

    case "OFFERING_MEMO_PDF": {
      const t = triageOutput!;
      const ctx = buildDealContext(deal, t);
      const sys = "You are a CRE marketing specialist at Gallagher Property Company, writing a professional offering memorandum to attract institutional buyers. Write in polished marketing language that is factual and compelling. Use provided data — never fabricate.";

      const [execSummary, location, marketOverview, income] = await Promise.all([
        generateNarrative(`Write an executive summary (2-3 paragraphs) for this offering:\n\n${ctx}\n\nHighlight: the opportunity, key metrics, entitlement status, and strategic value.`, sys, 500),
        generateNarrative(`Write a location analysis (2-3 paragraphs):\n\n${ctx}\n\nDescribe: property location in ${deal.jurisdiction?.name ?? "Louisiana"}, access, surrounding uses, proximity to infrastructure.`, sys, 400),
        generateNarrative(`Write a market overview (2-3 paragraphs):\n\n${ctx}\n\nCover: ${skuLabel(deal.sku)} market dynamics, vacancy rates, absorption trends, comparable lease rates.`, sys, 500),
        generateNarrative(`Write an income/financial analysis (2-3 paragraphs):\n\n${ctx}\n\nAddress: projected income, expense structure, NOI, cap rate, and return potential.`, sys, 400),
      ]);

      return {
        ...base,
        artifact_type: "OFFERING_MEMO_PDF",
        sections: [
          { key: "confidentiality", heading: "Confidentiality Notice", body_markdown: "This Offering Memorandum is provided solely for the purpose of evaluating the acquisition of the property described herein. By accepting this document, the recipient agrees to maintain the confidentiality of its contents." },
          { key: "exec_summary", heading: "Executive Summary", body_markdown: execSummary },
          { key: "property_description", heading: "Property Description", body_markdown: detailedParcelSummary(deal.parcels) },
          { key: "location", heading: "Location Analysis", body_markdown: location },
          { key: "income_analysis", heading: "Financial Analysis", body_markdown: income },
          { key: "financial_data", heading: "Financial Data", body_markdown: buildFinancialSnapshot(deal, t) },
          { key: "market_overview", heading: "Market Overview", body_markdown: marketOverview },
          {
            key: "entitlement_status",
            heading: "Entitlement Status",
            body_markdown: `**Current Status:** ${deal.status}\n**Triage Decision:** ${String(t.decision ?? "N/A")}\n**Confidence:** ${String(t.confidence ?? "N/A")}\n\n${fmtNextActions(t)}`,
          },
          { key: "risk_summary", heading: "Risk Summary", body_markdown: fmtRiskScores(t) },
          {
            key: "contact",
            heading: "Contact Information",
            body_markdown: "For additional information or to schedule a site visit, please contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
      };
    }

    case "COMP_ANALYSIS_PDF": {
      const t = triageOutput!;
      const allDeals = [deal, ...(comparisonDeals ?? [])];
      const comparisonItems = allDeals.map((d) => ({
        label: d.name,
        address: d.parcels.map((p) => p.address).join("; ") || "N/A",
        metrics: {
          "Product Type": skuLabel(d.sku),
          "Jurisdiction": d.jurisdiction?.name ?? "N/A",
          "Total Acreage": totalAcreage(d.parcels),
          "Zoning": [...new Set(d.parcels.map((p) => p.currentZoning).filter(Boolean))].join(", ") || "N/A",
          "Flood Zone": [...new Set(d.parcels.map((p) => p.floodZone).filter(Boolean))].join(", ") || "N/A",
          "Status": d.status,
          "Parcel Count": String(d.parcels.length),
        },
      }));

      const compContext = allDeals
        .map((d) => `${d.name}: ${skuLabel(d.sku)}, ${totalAcreage(d.parcels)} acres, ${d.jurisdiction?.name ?? "N/A"}, Status: ${d.status}`)
        .join("\n");

      const recommendation = await generateNarrative(
        `Compare these ${allDeals.length} deals and provide a recommendation on which represents the best opportunity for a ${skuLabel(deal.sku)} investment:\n\n${compContext}\n\nPrimary deal triage: Decision=${String(t.decision)}, Confidence=${String(t.confidence)}\n\nProvide a 2-3 paragraph recommendation covering relative strengths and weaknesses.`,
        "You are a CRE investment analyst at Gallagher Property Company. Provide an objective comparison and recommendation based on available data.",
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
            body_markdown: `This comparative analysis evaluates ${allDeals.length} ${skuLabel(deal.sku)} opportunit${allDeals.length === 1 ? "y" : "ies"}.\n\n**Primary Deal:** ${deal.name}\n**Comparison Deals:** ${comparisonDeals?.map((d) => d.name).join(", ") || "None (single-deal analysis)"}`,
          },
          {
            key: "primary_detail",
            heading: `Primary Deal: ${deal.name}`,
            body_markdown: detailedParcelSummary(deal.parcels),
          },
        ],
      };
    }
  }
}
