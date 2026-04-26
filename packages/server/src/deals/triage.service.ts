import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { prisma } from "@entitlement-os/db";
import {
  buildArtifactObjectKey,
  type ArtifactSpec,
  type DealStatus,
  type OpportunityScorecard,
  ParcelTriageSchema,
  type ThroughputRouting,
  type TriageWorkflowResult,
} from "@entitlement-os/shared";
import type { ParcelTriage } from "@entitlement-os/shared";
import * as Sentry from "@sentry/nextjs";
import { dispatchEvent } from "../automation/events";
import { captureAutomationDispatchError } from "../automation/sentry";
import { logger } from "../logger";
import { uploadArtifactToGateway } from "../services/gateway-storage.service";
import { resolveCurrentStageKey } from "@entitlement-os/db";

const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || "entitlement-os";
const TRIAGE_RESULT_TIMEOUT_MS = Number(process.env.TRIAGE_RESULT_TIMEOUT_MS ?? "15000");
const TRIAGE_RISK_SOURCE = "triage";

type TriageWorkflowError = Error & { code?: string };
type TemporalClient = Awaited<
  ReturnType<typeof import("../workflows/temporal-client").getTemporalClient>
>;

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

export type DealTriageResponse =
  | {
      statusCode: 202;
      body: {
        run: { id: string; startedAt: Date; status: "started" };
        triage: null;
        triageStatus: "queued";
        message: string;
      };
    }
  | {
      statusCode: 200;
      body: {
        run: { id: string; status: "succeeded" };
        triage: ParcelTriage;
        triageScore: number | null;
        summary: string | null;
        scorecard: OpportunityScorecard | null;
        routing: ThroughputRouting | null;
        rerun: { reusedPreviousRun: boolean; reason: string; sourceRunId?: string } | null;
        sources?: unknown;
      };
    };

export interface DealTriageSnapshot {
  run: {
    id: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
  } | null;
  triage: ParcelTriage | null;
  triageScore: number | null;
  summary: string | null;
  scorecard: OpportunityScorecard | null;
  routing: ThroughputRouting | null;
  rerun: { reusedPreviousRun: boolean; reason: string; sourceRunId?: string } | null;
}

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
      setTimeout(() => reject(createTimeoutError()), timeoutMs);
    }),
  ]);
}

async function getTemporalWorkflowClient(): Promise<TemporalClient> {
  const { getTemporalClient } = await import("../workflows/temporal-client");
  return getTemporalClient();
}

function clampRiskScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
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

  for (const [dimension, value] of Object.entries(params.triage.risk_scores) as Array<[string, number]>) {
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

  for (const disqualifier of params.triage.disqualifiers) {
    if (typeof disqualifier.label !== "string" || !disqualifier.label.trim()) continue;
    if (typeof disqualifier.detail !== "string" || !disqualifier.detail.trim()) continue;
    const sources = disqualifier.sources?.filter((source): source is string => Boolean(source)).join(", ");
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

  await prisma.dealRisk.deleteMany({
    where: { dealId: params.dealId, orgId: params.orgId, source: TRIAGE_RISK_SOURCE },
  });

  if (candidates.length === 0) {
    return;
  }

  await prisma.dealRisk.createMany({
    data: candidates.map((candidate) => ({
      dealId: params.dealId,
      orgId: params.orgId,
      ...candidate,
    })),
  });
}

interface TriagePdfParams {
  dealId: string;
  dealName: string;
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
  const run = await prisma.run.create({
    data: {
      orgId: params.orgId,
      dealId: params.dealId,
      runType: "ARTIFACT_GEN",
      status: "running",
    },
  });

  try {
    const triage = params.triageOutput;
    const parcelSummary = params.parcels
      .map((parcel, index) => {
        const parts = [`**Parcel ${index + 1}:** ${parcel.address}`];
        if (parcel.apn) parts.push(`APN: ${parcel.apn}`);
        if (parcel.acreage) parts.push(`Acreage: ${parcel.acreage.toString()}`);
        if (parcel.currentZoning) parts.push(`Zoning: ${parcel.currentZoning}`);
        if (parcel.floodZone) parts.push(`Flood Zone: ${parcel.floodZone}`);
        return parts.join(" | ");
      })
      .join("\n");

    const riskScores = triage.risk_scores as Record<string, number> | undefined;
    const riskText = riskScores
      ? Object.entries(riskScores)
          .map(([key, value]) => `**${key.replace(/_/g, " ")}:** ${value}/10`)
          .join("\n")
      : "No risk scores available.";

    const disqualifiers = triage.disqualifiers as
      | Array<{ label?: string; detail?: string; severity?: "hard" | "soft" }>
      | undefined;
    const hard = disqualifiers?.filter((item) => item.severity === "hard") ?? [];
    const soft = disqualifiers?.filter((item) => item.severity === "soft") ?? [];
    const disqualText = [
      hard.length > 0
        ? "**Hard Disqualifiers:**\n" +
          hard
            .map((item) => `- ${item.label ?? "Hard disqualifier"}: ${item.detail ?? "No detail provided"}`)
            .join("\n")
        : "**Hard Disqualifiers:** None",
      soft.length > 0
        ? "**Soft Disqualifiers:**\n" +
          soft
            .map((item) => `- ${item.label ?? "Soft disqualifier"}: ${item.detail ?? "No detail provided"}`)
            .join("\n")
        : "**Soft Disqualifiers:** None",
    ].join("\n\n");

    const actions = triage.next_actions as Array<{ title: string; description?: string }> | undefined;
    const actionsText = actions?.length
      ? actions.map((action, index) => `${index + 1}. **${action.title}**${action.description ? `: ${action.description}` : ""}`).join("\n")
      : "No next actions specified.";

    const spec: ArtifactSpec = {
      schema_version: "1.0",
      artifact_type: "TRIAGE_PDF",
      deal_id: params.dealId,
      title: `${params.dealName} - Triage Report`,
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
      where: { dealId: params.dealId, artifactType: "TRIAGE_PDF" },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestArtifact?.version ?? 0) + 1;

    const gatewayResult = await uploadArtifactToGateway({
      auth: { orgId: params.orgId, userId: "system" },
      dealId: params.dealId,
      artifactType: "TRIAGE_PDF",
      version: nextVersion,
      filename: rendered.filename,
      contentType: rendered.contentType,
      bytes: Buffer.from(rendered.bytes),
      generatedByRunId: run.id,
    });

    await prisma.artifact.create({
      data: {
        orgId: params.orgId,
        dealId: params.dealId,
        artifactType: "TRIAGE_PDF",
        version: nextVersion,
        storageObjectKey: gatewayResult.storageObjectKey,
        generatedByRunId: run.id,
      },
    });

    await prisma.run.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    logger.info("Deal triage auto-generated TRIAGE_PDF", {
      dealId: params.dealId,
      version: nextVersion,
      storageObjectKey: buildArtifactObjectKey({
        orgId: params.orgId,
        dealId: params.dealId,
        artifactType: "TRIAGE_PDF",
        version: nextVersion,
        filename: rendered.filename,
      }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), error: errorMessage },
    });
    throw error;
  }
}

function normalizeStoredTriageOutput(outputJson: Record<string, unknown> | null): DealTriageSnapshot {
  if (!outputJson || typeof outputJson !== "object") {
    return {
      run: null,
      triage: null,
      triageScore: null,
      summary: null,
      scorecard: null,
      routing: null,
      rerun: null,
    };
  }

  const maybeWrapper = outputJson;
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
  const triageScore = typeof maybeWrapper.triageScore === "number" ? maybeWrapper.triageScore : null;
  const summary = typeof maybeWrapper.summary === "string" ? maybeWrapper.summary : triage ? `${triage.decision}: ${triage.rationale}` : null;
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
    run: null,
    triage,
    triageScore,
    summary,
    scorecard,
    routing,
    rerun,
  };
}

export async function runDealTriage(params: {
  dealId: string;
  orgId: string;
  userId: string;
}): Promise<DealTriageResponse> {
  const deal = await prisma.deal.findFirst({
    where: { id: params.dealId, orgId: params.orgId },
    include: {
      jurisdiction: true,
      parcels: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!deal) {
    throw new Error("Deal not found");
  }

  if (deal.parcels.length === 0) {
    throw new Error("Deal must have at least one parcel to run triage");
  }

  const client = await getTemporalWorkflowClient();
  const workflowId = `triage-${deal.id}-${Date.now()}`;
  const handle = await client.workflow.start("triageWorkflow", {
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId,
    args: [{ orgId: params.orgId, dealId: deal.id }],
  });

  const startedAt = new Date();
  let result: TriageWorkflowResult;

  try {
    result = await withWorkflowTimeout(
      handle.result() as Promise<TriageWorkflowResult>,
      TRIAGE_RESULT_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTriageTimeout(error)) {
      return {
        statusCode: 202,
        body: {
          run: { id: workflowId, startedAt, status: "started" },
          triage: null,
          triageStatus: "queued",
          message: "Triage workflow running asynchronously. Poll /api/deals/[id]/triage for final status.",
        },
      };
    }
    throw error;
  }

  if (deal.status === "INTAKE") {
    const previousStageKey = deal.currentStageKey ?? resolveCurrentStageKey(null, "INTAKE");
    const nextStageKey = resolveCurrentStageKey(null, "TRIAGE_DONE" as DealStatus);

    await prisma.deal.update({
      where: { id: params.dealId },
      data: {
        status: "TRIAGE_DONE",
        legacyStatus: "TRIAGE_DONE",
        currentStageKey: nextStageKey,
      },
    });

    if (nextStageKey) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: params.dealId,
          orgId: params.orgId,
          fromStageKey: previousStageKey,
          toStageKey: nextStageKey,
          changedBy: params.userId,
          note: "Stage advanced after triage completion.",
        },
      });

      dispatchEvent({
        type: "deal.stageChanged",
        dealId: params.dealId,
        from: previousStageKey,
        to: nextStageKey,
        orgId: params.orgId,
      }).catch((error) => {
        captureAutomationDispatchError(error, {
          handler: "deals.triage.stage",
          eventType: "deal.stageChanged",
          dealId: params.dealId,
          orgId: params.orgId,
          status: "TRIAGE_DONE",
        });
      });
    }
  }

  dispatchEvent({
    type: "triage.completed",
    dealId: params.dealId,
    runId: result.runId,
    decision: result.triage.decision,
    orgId: params.orgId,
  }).catch((error) => {
    captureAutomationDispatchError(error, {
      handler: "deals.triage.complete",
      eventType: "triage.completed",
      dealId: params.dealId,
      orgId: params.orgId,
      status: deal.status,
    });
  });

  void syncTriageRisks({
    dealId: params.dealId,
    orgId: params.orgId,
    triage: result.triage,
  }).catch((error) => {
    logger.error("Failed to sync triage-derived risks", { error });
  });

  void generateTriagePdf({
    dealId: params.dealId,
    dealName: deal.name,
    orgId: params.orgId,
    triageOutput: result.triage,
    parcels: deal.parcels,
  }).catch((error) => {
    logger.error("Auto-generate TRIAGE_PDF failed", { error, dealId: params.dealId });
  });

  return {
    statusCode: 200,
    body: {
      run: { id: result.runId, status: "succeeded" },
      triage: result.triage,
      triageScore: result.triageScore,
      summary: result.summary,
      scorecard: result.scorecard,
      routing: result.routing,
      rerun: result.rerun,
      sources: result.sources,
    },
  };
}

export async function getLatestDealTriage(params: {
  dealId: string;
  orgId: string;
}): Promise<DealTriageSnapshot> {
  const deal = await prisma.deal.findFirst({
    where: { id: params.dealId, orgId: params.orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new Error("Deal not found");
  }

  const run = await prisma.run.findFirst({
    where: { dealId: params.dealId, orgId: params.orgId, runType: "TRIAGE" },
    orderBy: { startedAt: "desc" },
  });

  if (!run) {
    return {
      run: null,
      triage: null,
      triageScore: null,
      summary: null,
      scorecard: null,
      routing: null,
      rerun: null,
    };
  }

  const normalized = normalizeStoredTriageOutput(run.outputJson as Record<string, unknown> | null);
  return {
    ...normalized,
    run: {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
  };
}
