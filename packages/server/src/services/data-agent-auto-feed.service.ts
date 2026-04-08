import { getDataAgentSchemaCapabilities, prisma } from "@entitlement-os/db";

type JsonRecord = Record<string, unknown>;

export type AutoFeedInput = {
  orgId: string;
  runId: string;
  runType: string;
  agentIntent: string;
  finalOutputText: string;
  finalReport: JsonRecord | null;
  confidence: number | null;
  evidenceHash: string;
  toolsInvoked: string[];
  evidenceCitations: Array<{
    tool?: string;
    sourceId?: string;
    snapshotId?: string;
    contentHash?: string;
    url?: string;
    isOfficial?: boolean;
  }>;
  retrievalMeta?: JsonRecord;
  subjectId?: string;
  autoScore?: number;
};

export type AutoFeedResult = {
  episodeId?: string;
  summary: string;
  reflectionSuccess: boolean;
  rewardWriteSuccess: boolean;
  episodeCreated: boolean;
  errors: string[];
};

type EpisodeRow = { id: string };

const DEFAULT_SUBJECT_PREFIX = "agent-run";
type AutoFeedVectorMode = "embedded" | "missing-input" | "error";

export type DataAgentAutoFeedDeps = {
  isSchemaDriftError(error: unknown): boolean;
  isLocalAppRuntime(): boolean;
  logger: {
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, metadata?: Record<string, unknown>): void;
  };
  recordDataAgentAutoFeed(event: {
    runId: string;
    episodeId: string | null;
    vectorMode: AutoFeedVectorMode;
    kgEventsInserted: number;
    temporalEdgesInserted: number;
    rewardScore: number | null;
    status: string;
    hasWarnings: boolean;
  }): void;
};

function normalizeConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function shouldAutoFeed(): boolean {
  return process.env.DATA_AGENT_AUTO_FEED !== "false";
}

function validateAutoFeedInput(input: AutoFeedInput): string | null {
  if (!input.orgId) return "orgId is required";
  if (!input.runId) return "runId is required";
  if (!input.runType) return "runType is required";
  if (!input.agentIntent) return "agentIntent is required";
  if (!input.evidenceHash) return "evidenceHash is required";
  return null;
}

function buildEpisodeSummary(input: AutoFeedInput): string {
  const lines = [
    `Run type: ${input.runType}`,
    `Intent: ${input.agentIntent}`,
  ];

  const finalOutput = input.finalOutputText.trim();
  if (finalOutput) {
    lines.push(`Final output: ${finalOutput.slice(0, 3000)}`);
  }

  if (input.toolsInvoked.length > 0) {
    lines.push(`Tools: ${input.toolsInvoked.join(", ")}`);
  }

  return lines.join("\n");
}

function shouldSkipAutoFeedForLocalSchemaCapabilities(capabilities: {
  episode: boolean;
  knowledgeEmbedding: boolean;
  kgEvent: boolean;
  temporalEdge: boolean;
  rewardSignal: boolean;
}): boolean {
  return !(
    capabilities.episode &&
    capabilities.knowledgeEmbedding &&
    capabilities.kgEvent &&
    capabilities.temporalEdge &&
    capabilities.rewardSignal
  );
}

export async function autoFeedRun(
  input: AutoFeedInput,
  deps: DataAgentAutoFeedDeps,
): Promise<AutoFeedResult> {
  const validationError = validateAutoFeedInput(input);
  if (validationError) {
    deps.logger.warn("Data Agent auto-feed rejected malformed payload", {
      runId: input.runId,
      errors: [validationError],
    });
    deps.recordDataAgentAutoFeed({
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

  if (!shouldAutoFeed()) {
    return {
      summary: "Auto-feed disabled",
      reflectionSuccess: false,
      rewardWriteSuccess: false,
      episodeCreated: false,
      errors: ["AUTO_FEED_DISABLED"],
    };
  }

  const confidence = normalizeConfidence(input.confidence);
  const autoScore = normalizeConfidence(
    typeof input.autoScore === "number" && Number.isFinite(input.autoScore)
      ? input.autoScore
      : confidence,
  );
  const vectorMode: AutoFeedVectorMode =
    (input.finalOutputText && input.finalOutputText.trim().length > 0) || input.finalReport
      ? "embedded"
      : "missing-input";

  const summary = buildEpisodeSummary(input);
  const errors: string[] = [];
  let episodeCreated = false;
  let reflectionSuccess = false;
  let rewardWriteSuccess = false;
  let episodeId: string | undefined;
  let kgEventsInserted = 0;
  let temporalEdgesInserted = 0;

  deps.recordDataAgentAutoFeed({
    runId: input.runId,
    episodeId: null,
    vectorMode,
    kgEventsInserted: 0,
    temporalEdgesInserted: 0,
    rewardScore: autoScore,
    status: "started",
    hasWarnings: false,
  });

  if (deps.isLocalAppRuntime()) {
    const capabilities = await getDataAgentSchemaCapabilities();
    if (shouldSkipAutoFeedForLocalSchemaCapabilities(capabilities)) {
      deps.logger.info("Data Agent auto-feed skipped due to local schema drift", {
        runId: input.runId,
        episodeId,
        error: "Required Data Agent tables are unavailable in the local app database",
      });
      deps.recordDataAgentAutoFeed({
        runId: input.runId,
        episodeId: null,
        vectorMode: "error",
        kgEventsInserted: 0,
        temporalEdgesInserted: 0,
        rewardScore: autoScore,
        status: "schema_unavailable",
        hasWarnings: false,
      });

      return {
        summary,
        reflectionSuccess,
        rewardWriteSuccess,
        episodeCreated,
        errors: ["AUTO_FEED_SCHEMA_UNAVAILABLE"],
        episodeId,
      };
    }
  }

  try {
    const existing = await prisma.$queryRawUnsafe<EpisodeRow[]>(
      `SELECT id FROM "Episode" WHERE run_id = $1 LIMIT 1`,
      input.runId,
    );
    const existingEpisodeId = existing[0]?.id;

    if (existingEpisodeId) {
      episodeId = existingEpisodeId;
      deps.logger.info("Data Agent auto-feed skipped episode insert (idempotent)", {
        runId: input.runId,
        episodeId,
      });
    } else {
      const created = await prisma.$queryRawUnsafe<EpisodeRow[]>(
        `INSERT INTO "Episode" (
          run_id,
          agent_intent,
          evidence_hash,
          retrieval_meta,
          model_outputs,
          confidence,
          outcome_signal,
          next_state_hash,
          summary
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
        RETURNING id`,
        input.runId,
        input.agentIntent,
        input.evidenceHash,
        {
          subjectId: input.subjectId ?? `${DEFAULT_SUBJECT_PREFIX}:${input.runType}`,
          runType: input.runType,
          toolsInvoked: input.toolsInvoked,
          confidence,
          ...(input.retrievalMeta ?? {}),
        },
        {
          finalOutput: input.finalOutputText,
          finalReport: input.finalReport,
          confidence,
          toolsInvoked: input.toolsInvoked,
        },
        confidence,
        confidence !== null && confidence >= 0.8 ? "high_confidence" : "completed",
        null,
        summary,
      );
      episodeId = created[0]?.id;
      episodeCreated = true;
    }

    if (!episodeId) {
      throw new Error("Episode write failed");
    }

    await prisma.$queryRawUnsafe(
      `INSERT INTO "KnowledgeEmbedding" (
        content_type,
        source_id,
        content_text,
        metadata
      ) VALUES ($1, $2, $3, $4::jsonb)`,
      "episode",
      episodeId,
      summary,
      {
        runId: input.runId,
        orgId: input.orgId,
        evidenceHash: input.evidenceHash,
        toolsInvoked: input.toolsInvoked,
        citations: input.evidenceCitations,
      },
    );

    kgEventsInserted = await insertKnowledgeGraphEvents(input, episodeId);
    temporalEdgesInserted = await insertTemporalEdges(input, episodeId);
    reflectionSuccess = true;
    rewardWriteSuccess = await writeRewardSignal(input, episodeId, autoScore);
  } catch (error) {
    if (deps.isSchemaDriftError(error)) {
      errors.push("AUTO_FEED_SCHEMA_UNAVAILABLE");
    } else {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    deps.logger.error("Data Agent auto-feed failed", {
      runId: input.runId,
      episodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  deps.recordDataAgentAutoFeed({
    runId: input.runId,
    episodeId: episodeId ?? null,
    vectorMode,
    kgEventsInserted,
    temporalEdgesInserted,
    rewardScore: autoScore,
    status: errors.length === 0 ? "succeeded" : "failed",
    hasWarnings: errors.length > 0,
  });

  return {
    episodeId,
    summary,
    reflectionSuccess,
    rewardWriteSuccess,
    episodeCreated,
    errors,
  };
}

async function insertKnowledgeGraphEvents(input: AutoFeedInput, episodeId: string): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeGraphEvent" (org_id, episode_id, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    input.orgId,
    episodeId,
    "agent_run_completed",
    {
      runId: input.runId,
      runType: input.runType,
      toolsInvoked: input.toolsInvoked,
      citations: input.evidenceCitations,
    },
  );

  return Number(result ?? 0);
}

async function insertTemporalEdges(input: AutoFeedInput, episodeId: string): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `INSERT INTO "TemporalEdge" (org_id, source_episode_id, target_subject_id, relation_type, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    input.orgId,
    episodeId,
    input.subjectId ?? `${DEFAULT_SUBJECT_PREFIX}:${input.runType}`,
    "observed_in",
    {
      runId: input.runId,
      confidence: normalizeConfidence(input.confidence),
    },
  );

  return Number(result ?? 0);
}

async function writeRewardSignal(
  input: AutoFeedInput,
  episodeId: string,
  autoScore: number | null,
): Promise<boolean> {
  if (autoScore === null) {
    return false;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "RewardSignal" (org_id, run_id, episode_id, score, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    input.orgId,
    input.runId,
    episodeId,
    autoScore,
    {
      runType: input.runType,
      evidenceHash: input.evidenceHash,
    },
  );

  return true;
}
