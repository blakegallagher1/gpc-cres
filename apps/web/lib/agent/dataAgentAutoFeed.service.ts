/**
 * App-local Data Agent auto-feed implementation for completed runs.
 *
 * Uses Prisma to persist episodic memory, graph updates, and reward signal
 * without crossing monorepo-level service boundaries during Next.js compile.
 */

import { prisma } from "@entitlement-os/db";

type JsonRecord = Record<string, unknown>;

export type AutoFeedInput = {
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

type TimestampedRow = { id: string };
type EpisodeRow = { id: string };

const DEFAULT_SUBJECT_PREFIX = "agent-run";

/**
 * Ingest a completed run into episodic memory and graph updates.
 */
export async function autoFeedRun(input: AutoFeedInput): Promise<AutoFeedResult> {
  const confidence = normalizeConfidence(
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? input.confidence
      : 0.5,
  );
  const autoScore = normalizeConfidence(
    typeof input.autoScore === "number" && Number.isFinite(input.autoScore)
      ? input.autoScore
      : confidence,
  );
  const summary = buildEpisodeSummary(input);
  const errors: string[] = [];
  let episodeCreated = false;
  let reflectionSuccess = false;
  let rewardWriteSuccess = false;
  let episodeId: string | undefined;

  try {
    const existing = await prisma.$queryRawUnsafe<EpisodeRow[]>(
      `SELECT id FROM "Episode" WHERE run_id = $1 LIMIT 1`,
      input.runId,
    );
    const existingEpisodeId = existing[0]?.id;

    if (existingEpisodeId) {
      episodeId = existingEpisodeId;
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
        confidence >= 0.8 ? "high_confidence" : "completed",
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
        evidenceHash: input.evidenceHash,
        toolsInvoked: input.toolsInvoked,
        source: "web-auto-feed",
      },
    );

    const citationEvents: Array<{ id: string }> = [];
    for (const citation of input.evidenceCitations.slice(0, 8)) {
      const objectId =
        citation.tool ??
        citation.sourceId ??
        citation.snapshotId ??
        citation.url ??
        citation.contentHash ??
        "evidence";
      const createdEvent = await prisma.$queryRawUnsafe<TimestampedRow[]>(
        `INSERT INTO "KGEvent" (subject_id, predicate, object_id, confidence, source_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        input.subjectId ?? `${DEFAULT_SUBJECT_PREFIX}:${input.runId}`,
        citation.tool ? `tool:${citation.tool}` : "evidence:citation",
        objectId,
        confidence,
        input.evidenceHash,
      );
      if (createdEvent[0]?.id) {
        citationEvents.push(createdEvent[0]);
      }
    }

    for (let i = 1; i < citationEvents.length; i += 1) {
      await prisma.$queryRawUnsafe(
        `INSERT INTO "TemporalEdge" (from_event, to_event, relation)
         VALUES ($1, $2, $3)`,
        citationEvents[i - 1].id,
        citationEvents[i].id,
        `run:${input.runId}:sequence`,
      );
    }

    if (!citationEvents.length) {
      const fallback = await prisma.$queryRawUnsafe<TimestampedRow[]>(
        `INSERT INTO "KGEvent" (subject_id, predicate, object_id, confidence, source_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        input.subjectId ?? `${DEFAULT_SUBJECT_PREFIX}:${input.runId}`,
        "run:auto-feed",
        input.runId,
        confidence,
        input.evidenceHash,
      );
      if (!fallback[0]?.id) {
        throw new Error("KG fallback event write failed");
      }
    }

    const outcome = inferOutcome(5 * autoScore);
    await prisma.$queryRawUnsafe(
      `UPDATE "Episode" SET outcome_signal = $1, summary = COALESCE(summary, $2)
       WHERE id = $3`,
      outcome,
      summary,
      episodeId,
    );
    reflectionSuccess = true;

    const userScore = Math.max(0, Math.min(5, Math.round(autoScore * 5)));
    await prisma.$queryRawUnsafe(
      `INSERT INTO "RewardSignal" (episode_id, user_score, auto_score)
       VALUES ($1, $2, $3)`,
      episodeId,
      userScore,
      autoScore,
    );
    rewardWriteSuccess = true;

    return {
      episodeId,
      summary,
      reflectionSuccess,
      rewardWriteSuccess,
      episodeCreated,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      summary,
      reflectionSuccess,
      rewardWriteSuccess,
      episodeCreated,
      errors: errors.length ? errors : ["AUTO_FEED_FAILURE"],
      episodeId,
    };
  }
}

function buildEpisodeSummary(input: AutoFeedInput): string {
  const reportText =
    input.finalReport && Object.keys(input.finalReport).length > 0
      ? JSON.stringify(input.finalReport)
      : "";
  return [input.finalOutputText, reportText].filter(Boolean).join("\n").slice(0, 260)
    || "Run completed";
}

function normalizeConfidence(value: number): number {
  if (value > 1 && value <= 100) return value / 100;
  return Math.max(0, Math.min(1, value));
}

function inferOutcome(
  userScore: number,
): "positive_feedback" | "neutral_feedback" | "negative_feedback" {
  if (userScore >= 4) return "positive_feedback";
  if (userScore >= 2.5) return "neutral_feedback";
  return "negative_feedback";
}
