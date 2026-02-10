import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { buildArtifactObjectKey, DEAL_STATUSES, ARTIFACT_TYPES } from "@entitlement-os/shared";
import type { ArtifactType, DealStatus, ArtifactSpec } from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabase";

// Stage index for prerequisite checks (higher index = later stage)
const statusIndex = (s: DealStatus) => DEAL_STATUSES.indexOf(s);

// Minimum deal status required for each artifact type
const STAGE_PREREQUISITES: Record<ArtifactType, DealStatus> = {
  TRIAGE_PDF: "TRIAGE_DONE",
  SUBMISSION_CHECKLIST_PDF: "PREAPP",
  HEARING_DECK_PPTX: "SUBMITTED",
  EXIT_PACKAGE_PDF: "APPROVED",
  BUYER_TEASER_PDF: "EXIT_MARKETED",
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
    if (["SUBMISSION_CHECKLIST_PDF", "HEARING_DECK_PPTX", "BUYER_TEASER_PDF"].includes(aType) && deal.parcels.length === 0) {
      return NextResponse.json(
        { error: `At least one parcel is required to generate ${aType}` },
        { status: 400 }
      );
    }

    // Load latest succeeded triage run if needed
    let triageOutput: Record<string, unknown> | null = null;
    if (["TRIAGE_PDF", "HEARING_DECK_PPTX", "EXIT_PACKAGE_PDF"].includes(aType)) {
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
      const spec = await buildArtifactSpec(aType, deal, triageOutput);

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

async function buildArtifactSpec(
  artifactType: ArtifactType,
  deal: DealWithRelations & { jurisdictionId?: string },
  triageOutput: Record<string, unknown> | null
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
          key: "decision",
          heading: "Triage Decision",
          body_markdown: `**Recommendation:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}\n\n${String(triage.rationale ?? "")}`,
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
          key: "next_actions",
          heading: "Next Actions",
          body_markdown: formatNextActions(triage),
        },
        {
          key: "parcels",
          heading: "Parcel Summary",
          body_markdown: buildParcelSummary(deal.parcels),
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
      return {
        ...base,
        artifact_type: "BUYER_TEASER_PDF",
        sections: [
          {
            key: "opportunity",
            heading: "Investment Opportunity",
            body_markdown: `**${deal.name}**\nProduct Type: ${deal.sku}\nJurisdiction: ${deal.jurisdiction?.name ?? "Louisiana"}\n\nEntitled ${deal.sku.toLowerCase().replace(/_/g, " ")} opportunity with all approvals in place.`,
          },
          {
            key: "site",
            heading: "Site Details",
            body_markdown: buildParcelSummary(deal.parcels),
          },
          {
            key: "contact",
            heading: "Contact",
            body_markdown: "For more information, contact Gallagher Property Company.",
          },
        ],
      };
    }
  }
}

function artifactTypeLabel(t: ArtifactType): string {
  const labels: Record<ArtifactType, string> = {
    TRIAGE_PDF: "Triage Report",
    SUBMISSION_CHECKLIST_PDF: "Submission Checklist",
    HEARING_DECK_PPTX: "Hearing Deck",
    EXIT_PACKAGE_PDF: "Exit Package",
    BUYER_TEASER_PDF: "Buyer Teaser",
  };
  return labels[t];
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
