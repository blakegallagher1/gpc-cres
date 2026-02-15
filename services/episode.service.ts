/**
 * Episode service writes structured episodic memory from run state and model outputs.
 */

import { prisma } from "@entitlement-os/db";
import { createSummary } from "../ai/summary.ts";
import { withSpan } from "../openTelemetry/setup.ts";
import { logger } from "../utils/logger";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

type JsonRecord = Record<string, JSONValue>;

export type RunState = {
  runId: string;
  agentIntent: string;
  evidenceHash: string;
  retrievalMeta: JsonRecord;
  modelOutputs: JsonRecord;
  confidence?: number | null;
  outcomeSignal?: string | null;
  nextStateHash?: string | null;
};

export interface EpisodeRecord {
  id: string;
  runId: string;
  createdAt: string;
  agentIntent: string;
  evidenceHash: string;
  retrievalMeta: JsonRecord;
  modelOutputs: JsonRecord;
  confidence: number | null;
  outcomeSignal: string | null;
  nextStateHash: string | null;
  summary: string | null;
}

/**
 * Create an Episode row from run state, with an AI generated summary and validation.
 * Replays with same runId return the same episode for idempotency.
 */
export async function createEpisodeFromRun(runState: RunState): Promise<EpisodeRecord> {
  await withSpan("createEpisodeFromRun", async () => {
    validateRunState(runState);
  });

  const existing = await withSpan("createEpisodeFromRun.checkDuplicate", async () =>
    prisma.episode.findUnique({ where: { runId: runState.runId } }),
  );
  if (existing) {
    logger.info("Episode already exists. Returning existing row.", {
      runId: runState.runId,
    });
    return normalizeEpisode(existing);
  }

  const summary = await withSpan("createEpisodeFromRun.summarize", async () =>
    createSummary({
      runId: runState.runId,
      runState,
      generatedAt: new Date().toISOString(),
    }),
  );

  const created = await withSpan("createEpisodeFromRun.persist", async () =>
    prisma.episode.create({
      data: {
        runId: runState.runId,
        agentIntent: runState.agentIntent,
        evidenceHash: runState.evidenceHash,
        retrievalMeta: runState.retrievalMeta,
        modelOutputs: runState.modelOutputs,
        confidence:
          typeof runState.confidence === "number" ? runState.confidence : null,
        outcomeSignal: runState.outcomeSignal ?? null,
        nextStateHash: runState.nextStateHash ?? null,
        summary,
      },
    }),
  );

  logger.info("Episode created", { runId: runState.runId });
  return normalizeEpisode(created);
}

function validateRunState(runState: RunState): void {
  if (!runState?.runId || typeof runState.runId !== "string") {
    throw new Error("runState.runId is required and must be a string");
  }
  if (!runState?.agentIntent || typeof runState.agentIntent !== "string") {
    throw new Error("runState.agentIntent is required and must be a string");
  }
  if (!runState?.evidenceHash || typeof runState.evidenceHash !== "string") {
    throw new Error("runState.evidenceHash is required and must be a string");
  }
  if (!runState?.retrievalMeta || typeof runState.retrievalMeta !== "object") {
    throw new Error("runState.retrievalMeta is required and must be JSON");
  }
  if (!runState?.modelOutputs || typeof runState.modelOutputs !== "object") {
    throw new Error("runState.modelOutputs is required and must be JSON");
  }
  if (
    runState.confidence !== undefined &&
    runState.confidence !== null &&
    (typeof runState.confidence !== "number" ||
      Number.isNaN(runState.confidence) ||
      runState.confidence < 0 ||
      runState.confidence > 1)
  ) {
    throw new Error("runState.confidence must be between 0 and 1 when provided");
  }
}

function normalizeEpisode(value: unknown): EpisodeRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Episode create/read returned invalid data");
  }
  const record = value as Record<string, unknown>;
  return {
    id: String(record.id),
    runId: String(record.runId),
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : String(record.createdAt),
    agentIntent: String(record.agentIntent),
    evidenceHash: String(record.evidenceHash),
    retrievalMeta: ensureJsonRecord(record.retrievalMeta),
    modelOutputs: ensureJsonRecord(record.modelOutputs),
    confidence:
      record.confidence === null || typeof record.confidence === "number"
        ? (record.confidence as number | null)
        : null,
    outcomeSignal: typeof record.outcomeSignal === "string" ? (record.outcomeSignal as string) : null,
    nextStateHash:
      typeof record.nextStateHash === "string" ? (record.nextStateHash as string) : null,
    summary:
      typeof record.summary === "string" ? (record.summary as string) : null,
  };
}

function ensureJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}
