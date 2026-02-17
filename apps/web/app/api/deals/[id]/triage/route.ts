import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { getTemporalClient } from "@/lib/workflowClient";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import {
  ParcelTriageSchema,
  buildArtifactObjectKey,
  ArtifactSpec,
  type TriageWorkflowResult,
} from "@entitlement-os/shared";
import type {
  ParcelTriage,
  OpportunityScorecard,
  ThroughputRouting,
} from "@entitlement-os/shared";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";

// POST /api/deals/[id]/triage - run triage via Temporal
const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || "entitlement-os";
const TRIAGE_RESULT_TIMEOUT_MS = Number(process.env.TRIAGE_RESULT_TIMEOUT_MS ?? "15000");
const TRIAGE_RISK_SOURCE = "triage";

type TriageWorkflowError = Error & { code?: string };

function createTimeoutError(): TriageWorkflowError {
  const error = new Error("Triage workflow did not finish within the response window") as TriageWorkflowError;
  error.code = "TRIAGE_TIMEOUT";
  return error;
}

function isTriageTimeout(error: unknown): error is TriageWorkflowError {
  return error instanceof Error && error.name !== "AbortError" && (error as { code?: string }).code === "TRIAGE_TIMEOUT";
}

function withWorkflowTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(createTimeoutError());
      }, timeoutMs);
    }),
  ]);
}

type TriagedRiskCandidate = {
  category: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "monitoring" | "mitigating" | "accepted" | "closed";
  owner: string | null;
  source: string;
  score: number;
  notes: string | null;
};

function clampRiskScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidenceFromTriageRiskScore(value: number): number {
  return clampRiskScore((10 - value) * 10);
}

function deriveSeverityFromValue(value: number): "low" | "medium" | "high" | "critical" {
  if (value >= 9) return "critical";
  if (value >= 7) return "high";
  if (value >= 5) return "medium";
  return "low";
}

function titleize(raw: string): string {
  return raw
    .split("_")
    .map((segment) => (segment ? `${segment[0].toUpperCase()}${segment.slice(1)}` : segment))
    .join(" ");
}

async function syncTriageRisks(params: {
  dealId: string;
  orgId: string;
  triage: ParcelTriage;
}): Promise<void> {
  const candidates: TriagedRiskCandidate[] = [];

  const riskScores = triage.risk_scores;
  for (const [dimension, value] of Object.entries(riskScores) as Array<[string, number]>) {
    if (value >= 7) {
      candidates.push({
        category: "Risk Score",
        title: `${titleize(dimension)} risk is elevated`,
        description: `${titleize(dimension)} risk is elevated in triage scoring: ${value}/10.`,
        severity: deriveSeverityFromValue(value),
        status: "open",
        owner: null,
        source: TRIAGE_RISK_SOURCE,
        score: confidenceFromTriageRiskScore(value),
        notes: null,
      });
    }
  }

  for (const disqualifier of triage.disqualifiers) {
    if (typeof disqualifier.label !== "string" || !disqualifier.label.trim()) {
      continue;
    }
    if (typeof disqualifier.detail !== "string" || !disqualifier.detail.trim()) {
      continue;
    }
    const sources = disqualifier.sources
      ?.filter((source): source is string => Boolean(source))
      .join(", ");
    const severity = disqualifier.severity === "hard" ? "critical" : "medium";
    const score = disqualifier.severity === "hard" ? 10 : 6;
    candidates.push({
      category: "Disqualifier",
      title: disqualifier.label,
      description: disqualifier.detail,
      severity,
      status: "open",
      owner: null,
      source: TRIAGE_RISK_SOURCE,
      score: confidenceFromTriageRiskScore(score),
      notes: sources?.length ? `Sources: ${sources}` : null,
    });
  }

  if (candidates.length === 0) {
    await prisma.dealRisk.deleteMany({
      where: { dealId: params.dealId, orgId: params.orgId, source: TRIAGE_RISK_SOURCE },
    });
    return;
  }

  await prisma.dealRisk.deleteMany({
    where: { dealId: params.dealId, orgId: params.orgId, source: TRIAGE_RISK_SOURCE },
  });
  await prisma.dealRisk.createMany({
    data: candidates.map((candidate) => ({
      dealId: params.dealId,
      orgId: params.orgId,
      ...candidate,
    })),
  });
}

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

    const client = await getTemporalClient();
    const workflowId = `triage-${deal.id}-${Date.now()}`;
    const handle = await client.workflow.start("triageWorkflow", {
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId,
      args: [
        {
          orgId: auth.orgId,
          dealId: deal.id,
        },
      ],
    });

    const startedAt = new Date();
    let result: TriageWorkflowResult | null = null;
    try {
      result = await withWorkflowTimeout(
        handle.result() as Promise<TriageWorkflowResult>,
        TRIAGE_RESULT_TIMEOUT_MS,
      );
    } catch (error) {
      if (!isTriageTimeout(error)) {
        throw error;
      }

      return NextResponse.json(
        {
          run: {
            id: workflowId,
            startedAt,
            status: "started",
          },
          triage: null,
          triageStatus: "queued",
          message: "Triage workflow running asynchronously. Poll /api/deals/[id]/triage for final status.",
        },
        { status: 202 },
      );
    }

    if (deal.status === "INTAKE") {
      await prisma.deal.update({
        where: { id },
        data: { status: "TRIAGE_DONE" },
      });
      deal.status = "TRIAGE_DONE";
    }

    dispatchEvent({
      type: "triage.completed",
      dealId: id,
      runId: result.runId,
      decision: result.triage.decision,
      orgId: auth.orgId,
    }).catch((error) => {
      captureAutomationDispatchError(error, {
        handler: "api.deals.triage.complete",
        eventType: "triage.completed",
        dealId: id,
        orgId: auth.orgId,
        status: deal.status,
      });
      });
    syncTriageRisks({ dealId: id, orgId: auth.orgId, triage: result.triage })
      .catch((error) => {
        console.error("Failed to sync triage-derived risks:", error);
      });

    generateTriagePdf({
      dealId: id,
      dealName: deal.name,
      sku: deal.sku,
      status: deal.status,
      orgId: auth.orgId,
      triageOutput: result.triage,
      parcels: deal.parcels,
    }).catch((err) => console.error("Auto-generate TRIAGE_PDF failed (non-blocking):", err));

    return NextResponse.json({
      run: { id: result.runId, status: "succeeded" },
      triage: result.triage,
      triageScore: result.triageScore,
      summary: result.summary,
      scorecard: result.scorecard,
      routing: result.routing,
      rerun: result.rerun,
      sources: result.sources,
    });
  } catch (error) {
    console.error("Error running triage:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/triage", method: "POST" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
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
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/triage", method: "GET" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
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
