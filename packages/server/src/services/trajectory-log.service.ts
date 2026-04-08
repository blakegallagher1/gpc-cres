import "server-only";

import { prisma, type Prisma } from "@entitlement-os/db";
import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";

export type CreateTrajectoryLogFromRunInput = {
  runId: string;
  orgId: string;
  userId: string;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runType?: string | null;
  status: "succeeded" | "failed" | "canceled";
  inputPreview?: string | null;
  queryIntent?: string | null;
  signal?: AbortSignal;
};

export type CreateTrajectoryLogFromRunResult = {
  trajectoryLogId: string;
  agentId: string;
  taskInput: string;
};

type JsonRecord = Record<string, unknown>;
const NULL_JSON_VALUE = null as unknown as Prisma.NullableJsonNullValueInput;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return isRecord(value) ? value : {};
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getRunState(outputJson: JsonRecord): JsonRecord {
  return isRecord(outputJson.runState) ? outputJson.runState : {};
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractAgentId(outputJson: JsonRecord): string {
  if (typeof outputJson.lastAgentName === "string" && outputJson.lastAgentName.trim().length > 0) {
    return outputJson.lastAgentName.trim();
  }

  const runState = getRunState(outputJson);
  const runStateLastAgent = runState[AGENT_RUN_STATE_KEYS.lastAgentName];
  if (typeof runStateLastAgent === "string" && runStateLastAgent.trim().length > 0) {
    return runStateLastAgent.trim();
  }

  if (typeof runState.lastAgentName === "string" && runState.lastAgentName.trim().length > 0) {
    return runState.lastAgentName.trim();
  }

  return "Coordinator";
}

async function resolveTaskInput(
  inputPreview: string | null | undefined,
  orgId: string,
  conversationId: string | null | undefined,
): Promise<string> {
  if (typeof inputPreview === "string" && inputPreview.trim().length > 0) {
    return inputPreview.trim();
  }

  if (!conversationId) {
    return "[missing input preview]";
  }

  const message = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "user",
      conversation: {
        orgId,
      },
    },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });

  return typeof message?.content === "string" && message.content.trim().length > 0
    ? message.content.trim()
    : "[missing input preview]";
}

function extractRetrievedContextSummary(
  outputJson: JsonRecord,
  queryIntent: string | null | undefined,
): Prisma.InputJsonValue {
  const runState = getRunState(outputJson);
  const retrievalContext =
    isRecord(runState[AGENT_RUN_STATE_KEYS.retrievalContext])
      ? (runState[AGENT_RUN_STATE_KEYS.retrievalContext] as JsonRecord)
      : isRecord(runState.retrievalContext)
        ? (runState.retrievalContext as JsonRecord)
        : null;

  return toJsonValue(retrievalContext ?? { query: queryIntent ?? null, resultCount: 0 });
}

function extractPlan(outputJson: JsonRecord): string | null {
  const finalReport = isRecord(outputJson.finalReport) ? outputJson.finalReport : null;
  const executionPlan =
    finalReport && isRecord(finalReport.execution_plan)
      ? (finalReport.execution_plan as JsonRecord)
      : null;
  return typeof executionPlan?.summary === "string" ? executionPlan.summary : null;
}

function extractIntermediateSteps(
  trajectory: Prisma.JsonValue | null | undefined,
  outputJson: JsonRecord,
): Prisma.InputJsonValue {
  if (trajectory !== null && trajectory !== undefined) {
    return toJsonValue(trajectory);
  }

  if (outputJson.trajectory !== undefined) {
    return toJsonValue(outputJson.trajectory);
  }

  return toJsonValue([]);
}

function extractTrustJson(outputJson: JsonRecord): Prisma.InputJsonValue {
  return toJsonValue({
    confidence:
      typeof outputJson.confidence === "number" && Number.isFinite(outputJson.confidence)
        ? outputJson.confidence
        : null,
    missingEvidence: getStringArray(outputJson.missingEvidence),
    verificationSteps: getStringArray(outputJson.verificationSteps),
    toolFailures: getStringArray(outputJson.toolFailures),
    proofChecks: getStringArray(outputJson.proofChecks),
    retryMode: typeof outputJson.retryMode === "string" ? outputJson.retryMode : null,
    fallbackLineage: getStringArray(outputJson.fallbackLineage),
    fallbackReason:
      typeof outputJson.fallbackReason === "string" ? outputJson.fallbackReason : null,
  });
}

function extractEvidenceCitations(outputJson: JsonRecord): Prisma.InputJsonValue {
  return toJsonValue(Array.isArray(outputJson.evidenceCitations) ? outputJson.evidenceCitations : []);
}

function extractPackVersionsUsed(outputJson: JsonRecord): string[] {
  return getStringArray(outputJson.packVersionsUsed);
}

function extractLatencyMs(outputJson: JsonRecord): number {
  return typeof outputJson.durationMs === "number" && Number.isFinite(outputJson.durationMs)
    ? Math.max(0, Math.round(outputJson.durationMs))
    : 0;
}

function extractTokenUsage(outputJson: JsonRecord): Prisma.InputJsonValue {
  return toJsonValue(isRecord(outputJson.usage) ? outputJson.usage : {});
}

function extractCostUsd(outputJson: JsonRecord): number {
  const usage = isRecord(outputJson.usage) ? outputJson.usage : {};
  return Number(
    typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd) ? usage.costUsd : 0,
  );
}

function extractRiskEvents(
  outputJson: JsonRecord,
  status: CreateTrajectoryLogFromRunInput["status"],
): Prisma.InputJsonValue {
  return toJsonValue({
    status,
    missingEvidence: getStringArray(outputJson.missingEvidence),
    proofChecks: getStringArray(outputJson.proofChecks),
    toolFailures: getStringArray(outputJson.toolFailures),
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent learning promotion aborted");
  }
}

export async function createTrajectoryLogFromRun(
  input: CreateTrajectoryLogFromRunInput,
): Promise<CreateTrajectoryLogFromRunResult> {
  throwIfAborted(input.signal);
  const run = await prisma.run.findFirst({
    where: {
      id: input.runId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      dealId: true,
      jurisdictionId: true,
      outputJson: true,
      trajectory: true,
    },
  });

  if (!run) {
    throw new Error(`Run ${input.runId} not found for trajectory logging`);
  }

  const outputJson = toJsonRecord(run.outputJson);
  const agentId = extractAgentId(outputJson);
  const taskInput = await resolveTaskInput(input.inputPreview, input.orgId, input.conversationId);
  throwIfAborted(input.signal);
  const finalOutput =
    typeof outputJson.finalOutput === "string" ? outputJson.finalOutput : "";
  const evaluatorScore =
    typeof outputJson.confidence === "number" && Number.isFinite(outputJson.confidence)
      ? outputJson.confidence
      : null;

  const trajectoryLog = await prisma.trajectoryLog.upsert({
    where: {
      runId_agentId: {
        runId: input.runId,
        agentId,
      },
    },
    create: {
      orgId: input.orgId,
      runId: input.runId,
      agentId,
      conversationId: input.conversationId ?? null,
      dealId: input.dealId ?? run.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? run.jurisdictionId ?? null,
      taskInput,
      retrievedContextSummary: extractRetrievedContextSummary(outputJson, input.queryIntent),
      plan: extractPlan(outputJson),
      toolCalls: toJsonValue(getStringArray(outputJson.toolsInvoked)),
      toolResults: NULL_JSON_VALUE,
      intermediateSteps: extractIntermediateSteps(run.trajectory, outputJson),
      finalOutput,
      reflection: NULL_JSON_VALUE,
      evaluatorScore,
      latencyMs: extractLatencyMs(outputJson),
      tokenUsage: extractTokenUsage(outputJson),
      costUsd: extractCostUsd(outputJson),
      riskEvents: extractRiskEvents(outputJson, input.status),
      trustJson: extractTrustJson(outputJson),
      evidenceCitations: extractEvidenceCitations(outputJson),
      packVersionsUsed: extractPackVersionsUsed(outputJson),
    },
    update: {
      conversationId: input.conversationId ?? null,
      dealId: input.dealId ?? run.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? run.jurisdictionId ?? null,
      taskInput,
      retrievedContextSummary: extractRetrievedContextSummary(outputJson, input.queryIntent),
      plan: extractPlan(outputJson),
      toolCalls: toJsonValue(getStringArray(outputJson.toolsInvoked)),
      toolResults: NULL_JSON_VALUE,
      intermediateSteps: extractIntermediateSteps(run.trajectory, outputJson),
      finalOutput,
      reflection: NULL_JSON_VALUE,
      evaluatorScore,
      latencyMs: extractLatencyMs(outputJson),
      tokenUsage: extractTokenUsage(outputJson),
      costUsd: extractCostUsd(outputJson),
      riskEvents: extractRiskEvents(outputJson, input.status),
      trustJson: extractTrustJson(outputJson),
      evidenceCitations: extractEvidenceCitations(outputJson),
      packVersionsUsed: extractPackVersionsUsed(outputJson),
    },
    select: {
      id: true,
    },
  });

  return {
    trajectoryLogId: trajectoryLog.id,
    agentId,
    taskInput,
  };
}
