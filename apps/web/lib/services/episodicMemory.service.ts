import "server-only";

import { prisma, type Prisma } from "@entitlement-os/db";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";

import { deleteKnowledge, ingestKnowledge } from "@/lib/services/knowledgeBase.service";

export type CreateEpisodicEntryInput = {
  orgId: string;
  userId: string;
  runId: string;
  dealId?: string | null;
  jurisdictionId?: string | null;
  conversationId?: string | null;
  runType?: string | null;
  queryIntent?: string | null;
  trajectoryLogId: string;
  agentId: string;
  taskInput: string;
  status: "succeeded" | "failed" | "canceled";
  signal?: AbortSignal;
};

export type CreateEpisodicEntryResult = {
  episodicEntryId: string;
  embeddingId: string;
};

type EpisodeOutcome = "SUCCESS" | "FAILURE" | "PARTIAL";
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractToolSequence(toolCalls: Prisma.JsonValue): string[] {
  if (!Array.isArray(toolCalls)) return [];

  return toolCalls.flatMap((item) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [item.trim()];
    }
    if (isRecord(item) && typeof item.toolName === "string" && item.toolName.trim().length > 0) {
      return [item.toolName.trim()];
    }
    return [];
  });
}

function extractConfidence(trustJson: Prisma.JsonValue | null): number {
  if (!isRecord(trustJson)) return 0;
  const confidence = trustJson.confidence;
  return typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
}

function mapOutcome(status: CreateEpisodicEntryInput["status"]): EpisodeOutcome {
  if (status === "succeeded") return "SUCCESS";
  if (status === "failed") return "FAILURE";
  return "PARTIAL";
}

function truncateText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 3)}...`;
}

function buildSummary(params: {
  taskType: string;
  agentId: string;
  status: CreateEpisodicEntryInput["status"];
  queryIntent: string | null;
  dealId: string | null;
  jurisdictionId: string | null;
  taskInput: string;
  toolSequence: string[];
  evidenceCount: number;
  confidence: number;
  finalOutput: string;
}): string {
  return [
    `Task Type: ${params.taskType}`,
    `Agent: ${params.agentId}`,
    `Status: ${params.status}`,
    `Query Intent: ${params.queryIntent ?? "unknown"}`,
    `Deal: ${params.dealId ?? "n/a"}`,
    `Jurisdiction: ${params.jurisdictionId ?? "n/a"}`,
    "",
    "User Request:",
    params.taskInput,
    "",
    "What the agent did:",
    `- Tools: ${params.toolSequence.length > 0 ? params.toolSequence.join(", ") : "none"}`,
    `- Evidence citations: ${params.evidenceCount}`,
    `- Confidence: ${params.confidence.toFixed(2)}`,
    "",
    "Conclusion:",
    truncateText(params.finalOutput, 3000),
    "",
    "Reuse when:",
    "- Similar task type",
    "- Same jurisdiction or same deal pattern",
    "- Same evidence requirements",
  ].join("\n");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent learning promotion aborted");
  }
}

export async function createEpisodicEntryFromTrajectoryLog(
  input: CreateEpisodicEntryInput,
): Promise<CreateEpisodicEntryResult> {
  throwIfAborted(input.signal);
  const trajectoryLog = await prisma.trajectoryLog.findFirst({
    where: {
      id: input.trajectoryLogId,
      orgId: input.orgId,
      runId: input.runId,
    },
    select: {
      id: true,
      finalOutput: true,
      toolCalls: true,
      trustJson: true,
      evidenceCitations: true,
      retrievedContextSummary: true,
    },
  });

  if (!trajectoryLog) {
    throw new Error(`Trajectory log ${input.trajectoryLogId} not found for episodic creation`);
  }

  const taskType = input.runType ?? input.queryIntent ?? "ENRICHMENT";
  const toolSequence = extractToolSequence(trajectoryLog.toolCalls);
  const confidence = extractConfidence(trajectoryLog.trustJson);
  const evidenceCount = Array.isArray(trajectoryLog.evidenceCitations)
    ? trajectoryLog.evidenceCitations.length
    : 0;
  const summary = buildSummary({
    taskType,
    agentId: input.agentId,
    status: input.status,
    queryIntent: input.queryIntent ?? null,
    dealId: input.dealId ?? null,
    jurisdictionId: input.jurisdictionId ?? null,
    taskInput: input.taskInput,
    toolSequence,
    evidenceCount,
    confidence,
    finalOutput: trajectoryLog.finalOutput,
  });

  const sourceId = `episode:${input.runId}:${input.agentId}:${taskType}`;
  throwIfAborted(input.signal);
  await deleteKnowledge(input.orgId, sourceId).catch(() => 0);
  throwIfAborted(input.signal);
  const knowledgeIds = await ingestKnowledge(
    input.orgId,
    "episodic_summary",
    sourceId,
    summary,
    {
      orgId: input.orgId,
      runId: input.runId,
      agentId: input.agentId,
      taskType,
      dealId: input.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? null,
      conversationId: input.conversationId ?? null,
      runType: input.runType ?? null,
      queryIntent: input.queryIntent ?? null,
      outcome: mapOutcome(input.status),
      confidence,
      status: input.status,
    },
  );
  const embeddingId = knowledgeIds[0] ?? sourceId;

  throwIfAborted(input.signal);
  const episode = await prisma.episodicEntry.upsert({
    where: {
      orgId_runId_agentId_taskType: {
        orgId: input.orgId,
        runId: input.runId,
        agentId: input.agentId,
        taskType,
      },
    },
    create: {
      orgId: input.orgId,
      agentId: input.agentId,
      taskType,
      runId: input.runId,
      dealId: input.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? null,
      conversationId: input.conversationId ?? null,
      userId: input.userId,
      trajectoryLogId: input.trajectoryLogId,
      finalOutputHash: hashJsonSha256({ finalOutput: trajectoryLog.finalOutput }),
      summary,
      embeddingId,
      outcome: mapOutcome(input.status),
      confidence,
      tags: [
        taskType,
        input.agentId,
        ...(input.queryIntent ? [input.queryIntent] : []),
        ...(input.runType ? [input.runType] : []),
        input.status,
      ],
      toolSequence,
      retrievalContextSummary: toJsonValue(trajectoryLog.retrievedContextSummary),
      metadata: toJsonValue({
        taskType,
        runType: input.runType ?? null,
        queryIntent: input.queryIntent ?? null,
        dealId: input.dealId ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        conversationId: input.conversationId ?? null,
        confidence,
        evidenceCount,
      }),
    },
    update: {
      dealId: input.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? null,
      conversationId: input.conversationId ?? null,
      userId: input.userId,
      trajectoryLogId: input.trajectoryLogId,
      finalOutputHash: hashJsonSha256({ finalOutput: trajectoryLog.finalOutput }),
      summary,
      embeddingId,
      outcome: mapOutcome(input.status),
      confidence,
      tags: [
        taskType,
        input.agentId,
        ...(input.queryIntent ? [input.queryIntent] : []),
        ...(input.runType ? [input.runType] : []),
        input.status,
      ],
      toolSequence,
      retrievalContextSummary: toJsonValue(trajectoryLog.retrievedContextSummary),
      metadata: toJsonValue({
        taskType,
        runType: input.runType ?? null,
        queryIntent: input.queryIntent ?? null,
        dealId: input.dealId ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        conversationId: input.conversationId ?? null,
        confidence,
        evidenceCount,
      }),
    },
    select: {
      id: true,
    },
  });

  return {
    episodicEntryId: episode.id,
    embeddingId,
  };
}
