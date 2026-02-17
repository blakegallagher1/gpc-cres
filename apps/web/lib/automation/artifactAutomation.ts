import { prisma } from "@entitlement-os/db";
import {
  buildArtifactObjectKey,
} from "@entitlement-os/shared";
import type { ArtifactSpec, ArtifactType } from "@entitlement-os/shared";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

/**
 * #9b Artifact Auto-Generation: Generate BUYER_TEASER_PDF when deal reaches EXIT_MARKETED.
 *
 * Triggered by: deal.statusChanged event
 *
 * Only fires when the new status is EXIT_MARKETED. The deal must have at
 * least one parcel. Generation is fire-and-forget — failures are logged
 * but never propagate.
 */
export async function handleArtifactOnStatusChange(event: AutomationEvent): Promise<void> {
  if (event.type !== "deal.statusChanged") return;
  if (event.to !== "EXIT_MARKETED") return;

  const { dealId, orgId } = event;
  const artifactType: ArtifactType = "BUYER_TEASER_PDF";

  try {
    // Load deal
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      include: {
        parcels: { orderBy: { createdAt: "asc" } },
        jurisdiction: true,
      },
    });
    if (!deal || deal.parcels.length === 0) return;

    // Load triage output (optional for buyer teaser but used if available)
    const triageRun = await prisma.run.findFirst({
      where: { dealId, orgId, runType: "TRIAGE", status: "succeeded" },
      orderBy: { startedAt: "desc" },
      select: { outputJson: true },
    });
    const triageOutput = triageRun?.outputJson as Record<string, unknown> | null;
    const triage =
      triageOutput &&
      typeof triageOutput === "object" &&
      triageOutput.triage &&
      typeof triageOutput.triage === "object"
        ? (triageOutput.triage as Record<string, unknown>)
        : triageOutput;

    // Create run record
    const run = await prisma.run.create({
      data: { orgId, dealId, runType: "ARTIFACT_GEN", status: "running" },
    });

    try {
      // Build buyer teaser spec
      const acreage = totalAcreage(deal.parcels);
      const zonings = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))].join(", ") || "See Details";
      const highlights: string[] = [];
      if (parseFloat(acreage) > 0) highlights.push(`${acreage} acres of developable land`);
      if (deal.jurisdiction) highlights.push(`Located in ${deal.jurisdiction.name}, ${deal.jurisdiction.state}`);
      highlights.push(`${skuLabel(deal.sku)} product type`);
      highlights.push("Fully entitled — all approvals in place");
      if (triage && String(triage.decision) === "ADVANCE") {
        highlights.push("Passed triage with ADVANCE recommendation");
      }
      const zoneList = [...new Set(deal.parcels.map((p) => p.currentZoning).filter(Boolean))];
      if (zoneList.length > 0) highlights.push(`Zoned: ${zoneList.join(", ")}`);

      const spec: ArtifactSpec = {
        schema_version: "1.0",
        artifact_type: "BUYER_TEASER_PDF",
        deal_id: dealId,
        title: `${deal.name} - Buyer Teaser`,
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
          {
            key: "site",
            heading: "Site Details",
            body_markdown: deal.parcels
              .map((p, i) => {
                const lines = [`**Parcel ${i + 1}: ${p.address}**`];
                if (p.apn) lines.push(`- APN: ${p.apn}`);
                if (p.acreage) lines.push(`- Acreage: ${p.acreage.toString()}`);
                if (p.currentZoning) lines.push(`- Current Zoning: ${p.currentZoning}`);
                if (p.floodZone) lines.push(`- Flood Zone: ${p.floodZone}`);
                return lines.join("\n");
              })
              .join("\n\n"),
          },
          {
            key: "contact",
            heading: "Contact",
            body_markdown:
              "For more information, contact:\n\n**Gallagher Property Company**\nBaton Rouge, Louisiana\ngallagherpropco.com",
          },
        ],
        sources_summary: [],
      };

      const rendered = await renderArtifactFromSpec(spec);

      // Version
      const latest = await prisma.artifact.findFirst({
        where: { dealId, artifactType },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      // Storage
      const storageObjectKey = buildArtifactObjectKey({
        orgId,
        dealId,
        artifactType,
        version: nextVersion,
        filename: rendered.filename,
      });
      const { error: storageError } = await supabaseAdmin.storage
        .from("deal-room-uploads")
        .upload(storageObjectKey, Buffer.from(rendered.bytes), {
          contentType: rendered.contentType,
          upsert: false,
        });
      if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

      // DB record
      await prisma.artifact.create({
        data: {
          orgId,
          dealId,
          artifactType,
          version: nextVersion,
          storageObjectKey,
          generatedByRunId: run.id,
        },
      });

      await prisma.run.update({
        where: { id: run.id },
        data: { status: "succeeded", finishedAt: new Date() },
      });

      // Notify
      await createAutomationTask({
        orgId,
        dealId,
        type: "document_review",
        title: `Buyer Teaser v${nextVersion} Auto-Generated`,
        description: `A Buyer Teaser PDF was automatically generated for "${deal.name}" when the deal advanced to Exit Marketed. Review the document in the Artifacts tab.`,
        pipelineStep: 7, // EXIT_MARKETED is late-stage
      });

      console.log(
        `[automation] Auto-generated BUYER_TEASER_PDF v${nextVersion} for deal ${dealId}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.run.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), error: msg },
      });
      console.error(`[automation] BUYER_TEASER_PDF auto-gen failed for ${dealId}:`, msg);
    }
  } catch (error) {
    console.error(
      "[automation] handleArtifactOnStatusChange error:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * #9c Triage artifact notification: When triage completes, create a
 * notification that the Triage PDF was auto-generated.
 *
 * The actual PDF generation is already handled by the triage route
 * (fire-and-forget). This handler only creates the notification so
 * users know the document is ready.
 */
export async function handleTriageArtifactNotification(event: AutomationEvent): Promise<void> {
  if (event.type !== "triage.completed") return;

  const { dealId, orgId } = event;

  try {
    const artifactVersion = await ensureTriagePdfGenerated(dealId, orgId);
    if (artifactVersion === null) return;

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { name: true },
    });

    // Create notification for all org members
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
        title: "Triage Report Generated",
        body: `Triage Report v${artifactVersion} has been generated for "${deal?.name ?? dealId}".`,
        metadata: {
          automationType: "artifact_generated",
          artifactType: "TRIAGE_PDF",
          version: artifactVersion,
        },
        priority: "LOW" as never,
        actionUrl: `/deals/${dealId}`,
        sourceAgent: "automation",
      })),
    });
  } catch (err) {
    console.error(
      "[automation] handleTriageArtifactNotification error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureTriagePdfGenerated(dealId: string, orgId: string): Promise<number | null> {
  const existing = await prisma.artifact.findFirst({
    where: { dealId, orgId, artifactType: "TRIAGE_PDF" },
    orderBy: { createdAt: "desc" },
    select: { version: true },
  });
  if (existing) return existing.version;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: {
      parcels: { orderBy: { createdAt: "asc" } },
      jurisdiction: true,
    },
  });
  if (!deal || deal.parcels.length === 0) return null;

  const triageRun = await prisma.run.findFirst({
    where: { dealId, orgId, runType: "TRIAGE", status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { outputJson: true },
  });
  const triage = (triageRun?.outputJson ?? null) as Record<string, unknown> | null;

  const run = await prisma.run.create({
    data: { orgId, dealId, runType: "ARTIFACT_GEN", status: "running" },
  });

  try {
    const riskScores =
      triage && typeof triage.risk_scores === "object" && triage.risk_scores !== null
        ? (triage.risk_scores as Record<string, unknown>)
        : null;
    const riskText =
      riskScores != null
        ? Object.entries(riskScores)
            .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${String(v)}/10`)
            .join("\n")
        : "- Risk scores unavailable";
    const disqualifiers = Array.isArray(triage?.disqualifiers)
      ? (triage!.disqualifiers as Array<Record<string, unknown>>)
      : [];
    const actions = Array.isArray(triage?.next_actions)
      ? (triage!.next_actions as Array<Record<string, unknown>>)
      : [];

    const spec: ArtifactSpec = {
      schema_version: "1.0",
      artifact_type: "TRIAGE_PDF",
      deal_id: dealId,
      title: `${deal.name} - Triage Report`,
      sections: [
        {
          key: "executive_summary",
          heading: "Executive Summary",
          body_markdown: [
            `**Deal Name:** ${deal.name}`,
            `**Recommendation:** ${String(triage?.decision ?? "N/A")}`,
            `**Triage Tier:** ${String(triage?.decision ?? "N/A")}`,
            "",
            `**Rationale:** ${String(triage?.rationale ?? "Triage output pending rationale.")}`,
          ].join("\n"),
        },
        {
          key: "site_overview",
          heading: "Site Overview",
          body_markdown: [
            `**Jurisdiction:** ${deal.jurisdiction?.name ?? "N/A"}`,
            `**Addresses:** ${deal.parcels.map((p) => p.address).join("; ")}`,
            `**Total Acreage:** ${totalAcreage(deal.parcels)} acres`,
            `**Map Thumbnail:** [Map thumbnail placeholder]`,
          ].join("\n"),
        },
        {
          key: "entitlement_analysis",
          heading: "Entitlement Analysis",
          body_markdown: `Recommended path: ${String(triage?.recommended_path ?? "UNKNOWN")}\nExpected timeline: ${String(triage?.timeline_months ?? "N/A")} months`,
        },
        {
          key: "financial_summary",
          heading: "Financial Summary",
          body_markdown: `Projected IRR: ${String((triage as Record<string, unknown> | null)?.projected_irr ?? "N/A")}\nProjected cap rate: ${String((triage as Record<string, unknown> | null)?.projected_cap_rate ?? "N/A")}\nEquity multiple: ${String((triage as Record<string, unknown> | null)?.equity_multiple ?? "N/A")}`,
        },
        {
          key: "risk_matrix",
          heading: "Risk Matrix",
          body_markdown: riskText,
        },
        {
          key: "next_actions",
          heading: "Next Actions",
          body_markdown:
            actions.length > 0
              ? actions
                  .map((action) => `- ${String(action.title ?? "Action")} — ${String(action.description ?? "")}`)
                  .join("\n")
              : disqualifiers.length > 0
                ? disqualifiers
                    .map((disqualifier) => `- ${String(disqualifier.label ?? "Issue")} — ${String(disqualifier.detail ?? "")}`)
                    .join("\n")
                : "- No actions identified",
        },
      ],
      sources_summary: [],
    };

    const rendered = await renderArtifactFromSpec(spec);
    const latest = await prisma.artifact.findFirst({
      where: { dealId, artifactType: "TRIAGE_PDF" },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const storageObjectKey = buildArtifactObjectKey({
      orgId,
      dealId,
      artifactType: "TRIAGE_PDF",
      version: nextVersion,
      filename: rendered.filename,
    });
    const { error: storageError } = await supabaseAdmin.storage
      .from("deal-room-uploads")
      .upload(storageObjectKey, Buffer.from(rendered.bytes), {
        contentType: rendered.contentType,
        upsert: false,
      });
    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

    await prisma.artifact.create({
      data: {
        orgId,
        dealId,
        artifactType: "TRIAGE_PDF",
        version: nextVersion,
        storageObjectKey,
        generatedByRunId: run.id,
      },
    });
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });
    return nextVersion;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: msg },
    });
    console.error("[automation] TRIAGE_PDF auto-generation failed:", msg);
    return null;
  }
}

function totalAcreage(
  parcels: Array<{ acreage: { toString(): string } | null }>
): string {
  const sum = parcels.reduce(
    (acc, p) => acc + (p.acreage ? parseFloat(p.acreage.toString()) : 0),
    0
  );
  return sum > 0 ? sum.toFixed(2) : "N/A";
}

function skuLabel(sku: string): string {
  const labels: Record<string, string> = {
    SMALL_BAY_FLEX: "Small Bay Flex",
    OUTDOOR_STORAGE: "Outdoor Storage",
    TRUCK_PARKING: "Truck Parking",
  };
  return labels[sku] ?? sku;
}
