/**
 * Orchestration helper for automatic Data Agent memory ingestion after run completion.
 */

import { createEpisodeFromRun, RunState } from "./episode.service";
import { reflectAndUpdateMemory } from "./reflection.service";
import { addRewardSignal } from "./reward.service";
import { logger, recordDataAgentAutoFeed } from "../utils/logger";

type JsonRecord = Record<string, unknown>;

type EvidenceCitation = {
  tool?: string;
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
  url?: string;
  isOfficial?: boolean;
};

type AutoFeedVectorMode = "embedded" | "missing-input" | "error";

export interface AutoFeedInput {
  runId: string;
  runType: string;
  agentIntent: string;
  finalOutputText: string;
  finalReport: JsonRecord | null;
  confidence: number | null;
  evidenceHash: string;
  toolsInvoked: string[];
  evidenceCitations: EvidenceCitation[];
  retrievalMeta?: JsonRecord;
  subjectId?: string;
  autoScore?: number;
}

export interface AutoFeedResult {
  episodeId?: string;
  summary: string;
  reflectionSuccess: boolean;
  rewardWriteSuccess: boolean;
  episodeCreated: boolean;
  errors: string[];
}

const DEFAULT_SUBJECT_PREFIX = "agent-run";

/**
 * Create episode + reflection + reward telemetry for one completed run.
 * Intentionally resilient: each stage is isolated so memory ingestion cannot
 * fail a user-visible run completion.
 */
export async function autoFeedRun(input: AutoFeedInput): Promise<AutoFeedResult> {
  const validationError = validateAutoFeedInput(input);
  if (validationError) {
    logger.warn("Data Agent auto-feed rejected malformed payload", {
      runId: input.runId,
      errors: [validationError],
    });
    recordDataAgentAutoFeed({
      runId: input.runId,
      episodeId: null,
      vectorMode: "missing-input",
      kgEventsInserted: 0,
      temporalEdgesInserted: 0,
      rewardScore: null,
      status: "validation_error",
      hasWarnings: true,
    });
    return {
      summary: "Auto-feed payload validation failed",
      reflectionSuccess: false,
      rewardWriteSuccess: false,
      episodeCreated: false,
      errors: [validationError],
    };
  }

  const normalizedConfidence = normalizeConfidence(input.confidence);
  const runState = buildRunState(input, normalizedConfidence);
  const autoScore = clamp01(
    typeof input.autoScore === "number" && Number.isFinite(input.autoScore)
      ? input.autoScore
      : normalizedConfidence,
  );
  const vectorMode: AutoFeedVectorMode =
    (input.finalOutputText && input.finalOutputText.trim().length > 0) || input.finalReport
      ? "embedded"
      : "missing-input";
  const hasWarnings = false;

  let summary = "Not processed";
  const errors: string[] = [];
  let episodeCreated = false;
  let reflectionSuccess = false;
  let rewardWriteSuccess = false;
  let episodeId: string | undefined;
  let kgEventsInserted = 0;
  let temporalEdgesInserted = 0;

  recordDataAgentAutoFeed({
    runId: input.runId,
    episodeId: null,
    vectorMode,
    kgEventsInserted: 0,
    temporalEdgesInserted: 0,
    rewardScore: autoScore,
    status: "started",
    hasWarnings,
  });

  try {
    if (!shouldAutoFeed()) {
      recordDataAgentAutoFeed({
        runId: input.runId,
        episodeId: null,
        vectorMode,
        kgEventsInserted: 0,
        temporalEdgesInserted: 0,
        rewardScore: autoScore,
        status: "failed",
        hasWarnings: true,
      });
      return {
        summary: "Auto-feed disabled",
        reflectionSuccess: false,
        rewardWriteSuccess: false,
        episodeCreated: false,
        errors: ["AUTO_FEED_DISABLED"],
      };
    }

    const episode = await createEpisodeFromRun(runState);
    episodeCreated = true;
    episodeId = episode.id;
    summary = `Episode ${episode.id} ingested`;

    try {
      const reflection = await reflectAndUpdateMemory(episode);
      reflectionSuccess = !!reflection;
      kgEventsInserted = reflection.graphEventsCreated;
      temporalEdgesInserted = reflection.temporalEdgesCreated;
      logger.info("Data Agent reflection completed", {
        runId: input.runId,
        episodeId: episode.id,
        graphEventsCreated: reflection.graphEventsCreated,
        temporalEdgesCreated: reflection.temporalEdgesCreated,
      });
    } catch (error) {
      reflectionSuccess = false;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`reflection:${message}`);
      logger.warn("Data Agent reflection failed", {
        runId: input.runId,
        episodeId: episode.id,
        error: message,
      });
    }

    try {
      const derivedUserScore = Math.max(0, Math.min(5, Math.round(autoScore * 5)));
      const reward = await addRewardSignal(episode.id, derivedUserScore, autoScore);
      rewardWriteSuccess = true;
      logger.info("Data Agent reward persisted", {
        runId: input.runId,
        episodeId: episode.id,
        rewardId: reward.id,
        autoScore: reward.autoScore,
      });
    } catch (error) {
      rewardWriteSuccess = false;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`reward:${message}`);
      logger.warn("Data Agent reward persist failed", {
        runId: input.runId,
        episodeId: episode.id,
        error: message,
      });
    }

    recordDataAgentAutoFeed({
      runId: input.runId,
      episodeId,
      vectorMode,
      kgEventsInserted,
      temporalEdgesInserted,
      rewardScore: autoScore,
      status:
        reflectionSuccess && rewardWriteSuccess
          ? "succeeded"
          : errors.length > 0
            ? "failed"
            : "succeeded",
      hasWarnings: errors.length > 0,
    });

    return {
      summary,
      reflectionSuccess,
      rewardWriteSuccess,
      episodeCreated,
      errors,
      episodeId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`episode:${message}`);
    recordDataAgentAutoFeed({
      runId: input.runId,
      episodeId,
      vectorMode,
      kgEventsInserted,
      temporalEdgesInserted,
      rewardScore: autoScore,
      status: "failed",
      hasWarnings: true,
    });
    logger.warn("Data Agent episode ingest failed", {
      runId: input.runId,
      error: message,
    });
    return {
      summary: "Auto-feed episode ingest failed",
      reflectionSuccess: false,
      rewardWriteSuccess: false,
      episodeCreated: false,
      errors,
      episodeId,
    };
  }
}

function buildRunState(input: AutoFeedInput, confidence: number): RunState {
  const modelOutputs: JsonRecord = {
    finalOutput: input.finalOutputText,
    finalReport: input.finalReport ?? null,
    trust: {
      runType: input.runType,
      evidenceHash: input.evidenceHash,
      toolsInvoked: input.toolsInvoked,
      confidence,
    },
    toolEvidenceCitations: input.evidenceCitations,
  };

  const retrievalMeta: JsonRecord = {
    runType: input.runType,
    toolsInvoked: input.toolsInvoked,
    evidenceHash: input.evidenceHash,
    subjectId: input.subjectId ?? `${DEFAULT_SUBJECT_PREFIX}:${input.runType}`,
    ...(input.retrievalMeta ?? {}),
  };

  return {
    runId: input.runId,
    agentIntent: input.agentIntent,
    evidenceHash: input.evidenceHash,
    retrievalMeta,
    modelOutputs,
    confidence,
    outcomeSignal: confidence > 0.85 ? "high_confidence" : null,
    nextStateHash: null,
  };
}

function validateAutoFeedInput(input: AutoFeedInput): string | null {
  if (!input.runId || typeof input.runId !== "string" || input.runId.trim().length === 0) {
    return "runId is required";
  }
  if (!input.runType || typeof input.runType !== "string") {
    return "runType is required";
  }
  if (!input.agentIntent || typeof input.agentIntent !== "string" || input.agentIntent.trim().length === 0) {
    return "agentIntent is required";
  }
  if (!input.evidenceHash || typeof input.evidenceHash !== "string") {
    return "evidenceHash is required";
  }
  if (!Array.isArray(input.toolsInvoked)) {
    return "toolsInvoked must be an array";
  }
  if (typeof input.confidence !== "number" && input.confidence !== null) {
    return "confidence must be a number or null";
  }
  if (typeof input.finalOutputText !== "string") {
    return "finalOutputText must be a string";
  }
  if (input.finalReport !== null && typeof input.finalReport !== "object") {
    return "finalReport must be an object or null";
  }
  if (!Array.isArray(input.evidenceCitations)) {
    return "evidenceCitations must be an array";
  }
  if (input.retrievalMeta !== undefined && (typeof input.retrievalMeta !== "object" || input.retrievalMeta === null)) {
    return "retrievalMeta must be an object when provided";
  }
  if (input.subjectId !== undefined && (typeof input.subjectId !== "string" || input.subjectId.trim().length === 0)) {
    return "subjectId must be a non-empty string when provided";
  }
  if (typeof input.autoScore === "number") {
    if (!Number.isFinite(input.autoScore) || input.autoScore < 0 || input.autoScore > 1) {
      return "autoScore must be between 0 and 1";
    }
  }
  return null;
}

function normalizeConfidence(value: number | null): number {
  if (value === null) return 0.5;
  return clamp01(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function shouldAutoFeed(): boolean {
  if (process.env.NODE_ENV === "test") {
    return false;
  }
  const flag = process.env.DATA_AGENT_AUTOFED;
  if (flag === undefined) {
    return true;
  }
  return flag !== "0" && flag.toLowerCase() !== "false";
}
