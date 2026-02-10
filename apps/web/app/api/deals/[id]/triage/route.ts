import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import {
  ParcelTriageSchema,
  zodToOpenAiJsonSchema,
  buildArtifactObjectKey,
} from "@entitlement-os/shared";
import type { ParcelTriage, ArtifactSpec } from "@entitlement-os/shared";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { supabaseAdmin } from "@/lib/db/supabase";

// POST /api/deals/[id]/triage - run triage
export async function POST(
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
      include: {
        jurisdiction: true,
        parcels: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.parcels.length === 0) {
      return NextResponse.json(
        { error: "Deal must have at least one parcel to run triage" },
        { status: 400 }
      );
    }

    // Create run record
    const run = await prisma.run.create({
      data: {
        orgId: auth.orgId,
        dealId: id,
        runType: "TRIAGE",
        status: "running",
      },
    });

    try {
      // Build parcel context
      const parcelDescriptions = deal.parcels
        .map((p, i) => {
          const parts = [`Parcel ${i + 1}: ${p.address}`];
          if (p.apn) parts.push(`APN: ${p.apn}`);
          if (p.acreage) parts.push(`Acreage: ${p.acreage}`);
          if (p.currentZoning) parts.push(`Zoning: ${p.currentZoning}`);
          if (p.floodZone) parts.push(`Flood Zone: ${p.floodZone}`);
          if (p.soilsNotes) parts.push(`Soils: ${p.soilsNotes}`);
          if (p.wetlandsNotes) parts.push(`Wetlands: ${p.wetlandsNotes}`);
          if (p.envNotes) parts.push(`Environmental: ${p.envNotes}`);
          if (p.trafficNotes) parts.push(`Traffic: ${p.trafficNotes}`);
          if (p.utilitiesNotes) parts.push(`Utilities: ${p.utilitiesNotes}`);
          return parts.join("\n  ");
        })
        .join("\n\n");

      const systemPrompt = `You are a commercial real estate deal screener for Gallagher Property Company, specializing in light industrial, outdoor storage, and truck parking in Louisiana. Evaluate the following deal and produce a structured triage assessment. Use web search to verify current conditions, recent permits, environmental issues, and market data. Be thorough but decisive.`;

      const userPrompt = `Triage this deal:

Deal: ${deal.name}
SKU: ${deal.sku}
Jurisdiction: ${deal.jurisdiction?.name ?? "Unknown"}
Deal ID: ${deal.id}

${parcelDescriptions}

Evaluate all risk dimensions (access, drainage, adjacency, environmental, utilities, politics) on a 0-10 scale where 10 is highest risk. Identify any hard or soft disqualifiers. Recommend KILL, HOLD, or ADVANCE with a clear rationale and next actions.`;

      const jsonSchema = zodToOpenAiJsonSchema("ParcelTriage", ParcelTriageSchema);

      const result = await createStrictJsonResponse<ParcelTriage>({
        model: process.env.OPENAI_FLAGSHIP_MODEL || "gpt-5.2",
        input: [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt },
        ],
        jsonSchema,
        tools: [{ type: "web_search_preview" as const, search_context_size: "high" as const }],
      });

      // Update run as succeeded
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          outputJson: JSON.parse(JSON.stringify(result.outputJson)),
          openaiResponseId: result.responseId,
        },
      });

      // Advance deal status if currently INTAKE
      if (deal.status === "INTAKE") {
        await prisma.deal.update({
          where: { id },
          data: { status: "TRIAGE_DONE" },
        });
      }

      // Auto-generate TRIAGE_PDF (fire-and-forget — don't block the response)
      generateTriagePdf({
        dealId: id,
        dealName: deal.name,
        sku: deal.sku,
        status: deal.status,
        orgId: auth.orgId,
        triageOutput: result.outputJson as Record<string, unknown>,
        parcels: deal.parcels,
      }).catch((err) => console.error("Auto-generate TRIAGE_PDF failed (non-blocking):", err));

      return NextResponse.json({
        run: { id: run.id, status: "succeeded" },
        triage: result.outputJson,
        sources: result.toolSources.webSearchSources,
      });
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

      console.error("Triage failed:", error);
      return NextResponse.json(
        { error: "Triage failed", detail: errorMsg },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error running triage:", error);
    return NextResponse.json(
      { error: "Failed to run triage" },
      { status: 500 }
    );
  }
}

// GET /api/deals/[id]/triage - get latest triage result
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

    const run = await prisma.run.findFirst({
      where: { dealId: id, orgId: auth.orgId, runType: "TRIAGE" },
      orderBy: { startedAt: "desc" },
    });

    if (!run) {
      return NextResponse.json({ run: null, triage: null });
    }

    return NextResponse.json({
      run: {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
      triage: run.outputJson,
    });
  } catch (error) {
    console.error("Error fetching triage:", error);
    return NextResponse.json(
      { error: "Failed to fetch triage" },
      { status: 500 }
    );
  }
}

// --- Auto-generate TRIAGE_PDF helper ---

interface TriagePdfParams {
  dealId: string;
  dealName: string;
  sku: string;
  status: string;
  orgId: string;
  triageOutput: Record<string, unknown>;
  parcels: Array<{
    address: string;
    apn: string | null;
    acreage: { toString(): string } | null;
    currentZoning: string | null;
    floodZone: string | null;
  }>;
}

async function generateTriagePdf(params: TriagePdfParams): Promise<void> {
  const { dealId, dealName, sku, orgId, triageOutput, parcels } = params;

  const run = await prisma.run.create({
    data: {
      orgId,
      dealId,
      runType: "ARTIFACT_GEN",
      status: "running",
    },
  });

  try {
    const triage = triageOutput;
    const parcelSummary = parcels
      .map((p, i) => {
        const parts = [`**Parcel ${i + 1}:** ${p.address}`];
        if (p.apn) parts.push(`APN: ${p.apn}`);
        if (p.acreage) parts.push(`Acreage: ${p.acreage.toString()}`);
        if (p.currentZoning) parts.push(`Zoning: ${p.currentZoning}`);
        if (p.floodZone) parts.push(`Flood Zone: ${p.floodZone}`);
        return parts.join(" | ");
      })
      .join("\n");

    // Build risk scores text
    const riskScores = triage.risk_scores as Record<string, number> | undefined;
    const riskText = riskScores && typeof riskScores === "object"
      ? Object.entries(riskScores).map(([k, v]) => `**${k.replace(/_/g, " ")}:** ${v}/10`).join("\n")
      : "No risk scores available.";

    // Build disqualifiers text
    const hard = triage.hard_disqualifiers as string[] | undefined;
    const soft = triage.soft_disqualifiers as string[] | undefined;
    const disqualText = [
      hard && hard.length > 0 ? "**Hard Disqualifiers:**\n" + hard.map((d) => `- ${d}`).join("\n") : "**Hard Disqualifiers:** None",
      soft && soft.length > 0 ? "**Soft Disqualifiers:**\n" + soft.map((d) => `- ${d}`).join("\n") : "**Soft Disqualifiers:** None",
    ].join("\n\n");

    // Build next actions text
    const actions = triage.next_actions as Array<{ title: string; description?: string }> | undefined;
    const actionsText = actions && actions.length > 0
      ? actions.map((a, i) => `${i + 1}. **${a.title}**${a.description ? `: ${a.description}` : ""}`).join("\n")
      : "No next actions specified.";

    const spec: ArtifactSpec = {
      schema_version: "1.0",
      artifact_type: "TRIAGE_PDF",
      deal_id: dealId,
      title: `${dealName} - Triage Report`,
      sections: [
        {
          key: "decision",
          heading: "Triage Decision",
          body_markdown: `**Recommendation:** ${String(triage.decision ?? "N/A")}\n**Confidence:** ${String(triage.confidence ?? "N/A")}\n\n${String(triage.rationale ?? "")}`,
        },
        { key: "risk_scores", heading: "Risk Assessment", body_markdown: riskText },
        { key: "disqualifiers", heading: "Disqualifiers", body_markdown: disqualText },
        { key: "next_actions", heading: "Next Actions", body_markdown: actionsText },
        { key: "parcels", heading: "Parcel Summary", body_markdown: parcelSummary || "No parcels." },
      ],
      sources_summary: [],
    };

    const rendered = await renderArtifactFromSpec(spec);

    const latestArtifact = await prisma.artifact.findFirst({
      where: { dealId, artifactType: "TRIAGE_PDF" },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestArtifact?.version ?? 0) + 1;

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

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

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

    console.log(`Auto-generated TRIAGE_PDF v${nextVersion} for deal ${dealId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: errorMsg },
    });
    throw error;
  }
}
