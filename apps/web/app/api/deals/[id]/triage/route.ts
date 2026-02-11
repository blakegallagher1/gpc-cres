import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import {
  ParcelTriageSchema,
  zodToOpenAiJsonSchema,
  buildArtifactObjectKey,
  buildOpportunityScorecard,
  buildDeterministicRerunDecision,
  computeThroughputRouting,
} from "@entitlement-os/shared";
import type {
  ParcelTriage,
  ArtifactSpec,
  OpportunityScorecard,
  ThroughputRouting,
} from "@entitlement-os/shared";
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
      const rerunPayload = {
        dealId: deal.id,
        dealName: deal.name,
        sku: deal.sku,
        jurisdictionId: deal.jurisdictionId,
        parcels: deal.parcels.map((parcel) => ({
          id: parcel.id,
          apn: parcel.apn,
          address: parcel.address,
          acreage: parcel.acreage?.toString() ?? null,
          currentZoning: parcel.currentZoning,
          floodZone: parcel.floodZone,
          soilsNotes: parcel.soilsNotes,
          wetlandsNotes: parcel.wetlandsNotes,
          envNotes: parcel.envNotes,
          utilitiesNotes: parcel.utilitiesNotes,
          trafficNotes: parcel.trafficNotes,
        })),
      };

      const previousSucceededRun = await prisma.run.findFirst({
        where: {
          orgId: auth.orgId,
          dealId: id,
          runType: "TRIAGE",
          status: "succeeded",
          id: { not: run.id },
        },
        orderBy: { finishedAt: "desc" },
        select: {
          id: true,
          inputHash: true,
          outputJson: true,
        },
      });

      const rerunDecision = buildDeterministicRerunDecision({
        runType: "TRIAGE",
        dealId: id,
        orgId: auth.orgId,
        payload: rerunPayload,
        previousInputHash: previousSucceededRun?.inputHash,
      });

      if (rerunDecision.shouldReuse && previousSucceededRun?.outputJson) {
        const normalized = normalizeStoredTriageOutput(
          previousSucceededRun.outputJson as Record<string, unknown>,
        );

        if (
          normalized.triage &&
          normalized.scorecard &&
          normalized.routing &&
          typeof normalized.triageScore === "number" &&
          typeof normalized.summary === "string"
        ) {
          const reusedPayload = {
            triageScore: normalized.triageScore,
            summary: normalized.summary,
            triage: normalized.triage,
            scorecard: normalized.scorecard,
            routing: normalized.routing,
            rerun: {
              reusedPreviousRun: true,
              sourceRunId: previousSucceededRun.id,
              reason: rerunDecision.reason,
            },
          };

          await prisma.run.update({
            where: { id: run.id },
            data: {
              status: "succeeded",
              finishedAt: new Date(),
              inputHash: rerunDecision.inputHash,
              outputJson: reusedPayload,
            },
          });

          if (deal.status === "INTAKE") {
            await prisma.deal.update({
              where: { id },
              data: { status: "TRIAGE_DONE" },
            });
          }

          dispatchEvent({
            type: "triage.completed",
            dealId: id,
            runId: run.id,
            decision: normalized.triage.decision,
            orgId: auth.orgId,
          }).catch(() => {});

          generateTriagePdf({
            dealId: id,
            dealName: deal.name,
            sku: deal.sku,
            status: deal.status,
            orgId: auth.orgId,
            triageOutput: normalized.triage,
            parcels: deal.parcels,
          }).catch((err) => console.error("Auto-generate TRIAGE_PDF failed (non-blocking):", err));

          return NextResponse.json({
            run: { id: run.id, status: "succeeded" },
            triage: normalized.triage,
            triageScore: normalized.triageScore,
            summary: normalized.summary,
            scorecard: normalized.scorecard,
            routing: normalized.routing,
            rerun: reusedPayload.rerun,
            sources: [],
          });
        }
      }

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

      const triage = ParcelTriageSchema.parse({
        ...(result.outputJson as Record<string, unknown>),
        generated_at:
          (result.outputJson as Record<string, unknown>).generated_at ?? new Date().toISOString(),
        deal_id: (result.outputJson as Record<string, unknown>).deal_id ?? deal.id,
      });

      const avgRisk =
        Object.values(triage.risk_scores).reduce((sum, value) => sum + value, 0) /
        Math.max(Object.keys(triage.risk_scores).length, 1);
      const triageScore = Math.round(((10 - avgRisk) / 10) * 10000) / 100;
      const summary = `${triage.decision}: ${triage.rationale}`;

      const scorecard = buildOpportunityScorecard({
        dealId: deal.id,
        triage,
        rerunPolicy: {
          input_hash: rerunDecision.inputHash,
          deterministic: true,
          rerun_reason: rerunDecision.reason,
        },
      });

      const routing = computeThroughputRouting({
        parcelCount: deal.parcels.length,
        avgRiskScore: avgRisk,
        disqualifierCount: triage.disqualifiers.length,
        confidence: scorecard.overall_confidence,
        missingDataCount: triage.assumptions.filter((item) => item.sources == null).length,
      });

      const outputPayload = {
        triageScore,
        summary,
        triage,
        scorecard,
        routing,
        rerun: { reusedPreviousRun: false, reason: rerunDecision.reason },
      };

      // Update run as succeeded
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          inputHash: rerunDecision.inputHash,
          outputJson: outputPayload,
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

      // Dispatch triage.completed event for automation handlers
      dispatchEvent({
        type: "triage.completed",
        dealId: id,
        runId: run.id,
        decision: triage.decision,
        orgId: auth.orgId,
      }).catch(() => {});

      // Auto-generate TRIAGE_PDF (fire-and-forget — don't block the response)
      generateTriagePdf({
        dealId: id,
        dealName: deal.name,
        sku: deal.sku,
        status: deal.status,
        orgId: auth.orgId,
        triageOutput: triage,
        parcels: deal.parcels,
      }).catch((err) => console.error("Auto-generate TRIAGE_PDF failed (non-blocking):", err));

      return NextResponse.json({
        run: { id: run.id, status: "succeeded" },
        triage,
        triageScore,
        summary,
        scorecard,
        routing,
        rerun: outputPayload.rerun,
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

    const normalized = normalizeStoredTriageOutput(run.outputJson as Record<string, unknown> | null);

    return NextResponse.json({
      run: {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
      triage: normalized.triage,
      triageScore: normalized.triageScore,
      summary: normalized.summary,
      scorecard: normalized.scorecard,
      routing: normalized.routing,
      rerun: normalized.rerun,
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
    const disqualifiers = triage.disqualifiers as
      | Array<{ label?: string; detail?: string; severity?: "hard" | "soft" }>
      | undefined;
    const hard = disqualifiers?.filter((item) => item.severity === "hard") ?? [];
    const soft = disqualifiers?.filter((item) => item.severity === "soft") ?? [];
    const disqualText = [
      hard.length > 0
        ? "**Hard Disqualifiers:**\n" +
          hard
            .map((d) => `- ${d.label ?? "Hard disqualifier"}: ${d.detail ?? "No detail provided"}`)
            .join("\n")
        : "**Hard Disqualifiers:** None",
      soft.length > 0
        ? "**Soft Disqualifiers:**\n" +
          soft
            .map((d) => `- ${d.label ?? "Soft disqualifier"}: ${d.detail ?? "No detail provided"}`)
            .join("\n")
        : "**Soft Disqualifiers:** None",
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

function normalizeStoredTriageOutput(outputJson: Record<string, unknown> | null): {
  triage: ParcelTriage | null;
  triageScore: number | null;
  summary: string | null;
  scorecard: OpportunityScorecard | null;
  routing: ThroughputRouting | null;
  rerun: { reusedPreviousRun: boolean; reason: string; sourceRunId?: string } | null;
} {
  if (!outputJson || typeof outputJson !== "object") {
    return {
      triage: null,
      triageScore: null,
      summary: null,
      scorecard: null,
      routing: null,
      rerun: null,
    };
  }

  const maybeWrapper = outputJson as Record<string, unknown>;
  const triageCandidate =
    maybeWrapper.triage && typeof maybeWrapper.triage === "object"
      ? (maybeWrapper.triage as Record<string, unknown>)
      : maybeWrapper;

  const triageParsed = ParcelTriageSchema.safeParse({
    ...triageCandidate,
    generated_at: triageCandidate.generated_at ?? new Date().toISOString(),
    deal_id: triageCandidate.deal_id ?? "unknown",
  });
  const triage = triageParsed.success ? triageParsed.data : null;

  const triageScore =
    typeof maybeWrapper.triageScore === "number"
      ? maybeWrapper.triageScore
      : null;
  const summary =
    typeof maybeWrapper.summary === "string"
      ? maybeWrapper.summary
      : triage
      ? `${triage.decision}: ${triage.rationale}`
      : null;

  const scorecard =
    maybeWrapper.scorecard && typeof maybeWrapper.scorecard === "object"
      ? (maybeWrapper.scorecard as OpportunityScorecard)
      : null;
  const routing =
    maybeWrapper.routing && typeof maybeWrapper.routing === "object"
      ? (maybeWrapper.routing as ThroughputRouting)
      : null;
  const rerun =
    maybeWrapper.rerun &&
    typeof maybeWrapper.rerun === "object" &&
    typeof (maybeWrapper.rerun as Record<string, unknown>).reason === "string" &&
    typeof (maybeWrapper.rerun as Record<string, unknown>).reusedPreviousRun === "boolean"
      ? (maybeWrapper.rerun as { reusedPreviousRun: boolean; reason: string; sourceRunId?: string })
      : null;

  return {
    triage,
    triageScore,
    summary,
    scorecard,
    routing,
    rerun,
  };
}
