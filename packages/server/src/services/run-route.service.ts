import { prisma } from "@entitlement-os/db";
import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";

type JsonRecord = Record<string, unknown>;

type RunFilters = {
  status?: string | null;
  runType?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  limit?: number | null;
};

type TraceRow = {
  id: string;
  run_id: string;
  parent_id: string | null;
  type: string;
  name: string;
  input: unknown;
  output: unknown;
  started_at: Date;
  duration_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost: number | null;
  metadata: unknown;
};

export class RunRouteNotFoundError extends Error {
  constructor(message = "Run not found") {
    super(message);
    this.name = "RunRouteNotFoundError";
  }
}

export class RunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunValidationError";
  }
}

export class RunConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunConflictError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toJsonRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function readSummaryFromOutputJson(outputJson: unknown): {
  lastAgentName?: string;
  confidence?: number | null;
  evidenceCount: number;
  missingEvidenceCount: number;
  toolCount: number;
} {
  if (!isRecord(outputJson)) {
    return {
      evidenceCount: 0,
      missingEvidenceCount: 0,
      toolCount: 0,
    };
  }

  const runState = isRecord(outputJson.runState) ? outputJson.runState : null;
  const lastAgentName =
    typeof outputJson.lastAgentName === "string"
      ? outputJson.lastAgentName
      : runState && typeof runState[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.lastAgentName])
        : undefined;

  const confidenceCandidate =
    typeof outputJson.confidence === "number" && Number.isFinite(outputJson.confidence)
      ? outputJson.confidence
      : runState &&
          typeof runState[AGENT_RUN_STATE_KEYS.confidence] === "number" &&
          Number.isFinite(runState[AGENT_RUN_STATE_KEYS.confidence])
        ? Number(runState[AGENT_RUN_STATE_KEYS.confidence])
        : null;

  const missingEvidence = Array.isArray(outputJson.missingEvidence)
    ? toStringArray(outputJson.missingEvidence)
    : runState && Array.isArray(runState[AGENT_RUN_STATE_KEYS.missingEvidence])
      ? toStringArray(runState[AGENT_RUN_STATE_KEYS.missingEvidence])
      : [];

  const toolsInvoked = Array.isArray(outputJson.toolsInvoked)
    ? toStringArray(outputJson.toolsInvoked)
    : runState && Array.isArray(runState[AGENT_RUN_STATE_KEYS.toolsInvoked])
      ? toStringArray(runState[AGENT_RUN_STATE_KEYS.toolsInvoked])
      : [];

  const evidenceCount = Array.isArray(outputJson.evidenceCitations)
    ? outputJson.evidenceCitations.length
    : 0;

  return {
    lastAgentName,
    confidence: confidenceCandidate,
    evidenceCount,
    missingEvidenceCount: missingEvidence.length,
    toolCount: toolsInvoked.length,
  };
}

function toRunResponse(run: {
  id: string;
  orgId: string;
  runType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  dealId: string | null;
  jurisdictionId: string | null;
  sku: string | null;
  error: string | null;
  inputHash: string | null;
  openaiResponseId: string | null;
  outputJson: unknown;
}) {
  const durationMs = run.finishedAt
    ? run.finishedAt.getTime() - run.startedAt.getTime()
    : null;

  return {
    id: run.id,
    orgId: run.orgId,
    runType: run.runType,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs,
    dealId: run.dealId ?? null,
    jurisdictionId: run.jurisdictionId ?? null,
    sku: run.sku ?? null,
    error: run.error ?? null,
    inputHash: run.inputHash ?? null,
    openaiResponseId: run.openaiResponseId ?? null,
  };
}

export async function listRuns(orgId: string, filters: RunFilters) {
  const where: Record<string, unknown> = { orgId };

  if (typeof filters.status === "string" && filters.status.length > 0) {
    where.status = filters.status;
  }
  if (typeof filters.runType === "string" && filters.runType.length > 0) {
    where.runType = filters.runType;
  }
  if (typeof filters.dealId === "string" && filters.dealId.length > 0) {
    where.dealId = filters.dealId;
  }
  if (
    typeof filters.jurisdictionId === "string" &&
    filters.jurisdictionId.length > 0
  ) {
    where.jurisdictionId = filters.jurisdictionId;
  }

  const limit =
    typeof filters.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(200, Math.floor(filters.limit)))
      : 50;

  const runs = await prisma.run.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      orgId: true,
      runType: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      dealId: true,
      jurisdictionId: true,
      sku: true,
      error: true,
      inputHash: true,
      openaiResponseId: true,
      outputJson: true,
    },
  });

  return runs.map((run) => ({
    ...toRunResponse(run),
    summary: readSummaryFromOutputJson(run.outputJson),
  }));
}

export async function getRunDetail(orgId: string, runId: string) {
  const run = await prisma.run.findFirst({
    where: { id: runId, orgId },
    select: {
      id: true,
      orgId: true,
      runType: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      dealId: true,
      jurisdictionId: true,
      sku: true,
      error: true,
      inputHash: true,
      openaiResponseId: true,
      outputJson: true,
    },
  });

  if (!run) {
    throw new RunRouteNotFoundError();
  }

  return {
    ...toRunResponse(run),
    outputJson: run.outputJson ?? null,
  };
}

export async function deleteRun(orgId: string, runId: string) {
  const deleted = await prisma.run.deleteMany({
    where: { id: runId, orgId },
  });

  if (deleted.count === 0) {
    throw new RunRouteNotFoundError();
  }
}

export async function getRunTraces(orgId: string, runId: string) {
  const run = await prisma.run.findFirst({
    where: { id: runId, orgId },
    select: { id: true },
  });

  if (!run) {
    throw new RunRouteNotFoundError();
  }

  try {
    const rows = await prisma.$queryRawUnsafe<TraceRow[]>(
      `SELECT
         t.id,
         t.run_id,
         t.parent_id,
         t.type,
         t.name,
         t.input,
         t.output,
         t.started_at,
         t.duration_ms,
         t.tokens_input,
         t.tokens_output,
         t.cost,
         t.metadata
       FROM traces t
       JOIN runs r ON r.id = t.run_id
       WHERE t.run_id = $1 AND r.org_id = $2
       ORDER BY t.started_at ASC`,
      runId,
      orgId,
    );

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      parentId: row.parent_id ?? null,
      type:
        row.type === "llm" ||
        row.type === "tool" ||
        row.type === "handoff" ||
        row.type === "custom"
          ? row.type
          : "custom",
      name: row.name,
      input: toJsonRecord(row.input),
      output: toJsonRecord(row.output),
      startedAt: row.started_at.toISOString(),
      durationMs: row.duration_ms ?? null,
      tokensInput: row.tokens_input ?? null,
      tokensOutput: row.tokens_output ?? null,
      cost: row.cost ?? null,
      metadata: toJsonRecord(row.metadata),
    }));
  } catch {
    return [];
  }
}

type RewardPayload = {
  userScore?: unknown;
  autoScore?: unknown;
};

type RewardInsertRow = {
  id: string;
  episode_id: string;
  user_score: number | null;
  auto_score: number | null;
  timestamp: Date;
};

function normalizeUserScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    return null;
  }
  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeAutoScore(value: unknown, fallbackValue: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp01(value);
  }

  const fallback =
    typeof fallbackValue === "number" && Number.isFinite(fallbackValue)
      ? fallbackValue
      : 0.25;
  return clamp01(fallback);
}

export async function createRunReward(
  orgId: string,
  runId: string,
  payload: RewardPayload | null,
) {
  const run = await prisma.run.findFirst({
    where: { id: runId, orgId },
    select: {
      id: true,
      outputJson: true,
    },
  });

  if (!run) {
    throw new RunRouteNotFoundError("Run not found");
  }

  if (!payload || typeof payload !== "object") {
    throw new RunValidationError("Invalid reward payload");
  }

  const userScore = normalizeUserScore(payload.userScore);
  if (userScore === null) {
    throw new RunValidationError(
      "Invalid userScore. Must be an integer between 0 and 5.",
    );
  }

  const episodeRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Episode" WHERE run_id = $1 LIMIT 1`,
    runId,
  );
  const episodeId = episodeRows[0]?.id;
  if (!episodeId) {
    throw new RunConflictError(
      "No episode exists for this run yet. Try again shortly.",
    );
  }

  const outputJson = run.outputJson as JsonRecord | null;
  const autoScore = normalizeAutoScore(payload.autoScore, outputJson?.confidence);

  const createdRewardRows = await prisma.$queryRawUnsafe<RewardInsertRow[]>(
    `INSERT INTO "RewardSignal" (episode_id, user_score, auto_score)
     VALUES ($1, $2, $3)
     RETURNING id, episode_id, user_score, auto_score, timestamp`,
    episodeId,
    userScore,
    autoScore,
  );
  const reward = createdRewardRows[0];
  if (!reward) {
    throw new Error("RewardSignal insert failed");
  }

  const composite = (userScore / 5) * 0.7 + autoScore * 0.3;
  const outcomeSignal =
    composite >= 0.8
      ? "positive_feedback"
      : composite >= 0.5
        ? "neutral_feedback"
        : "negative_feedback";

  await prisma.$queryRawUnsafe(
    `UPDATE "Episode" SET outcome_signal = $1 WHERE id = $2`,
    outcomeSignal,
    episodeId,
  );

  return {
    id: reward.id,
    episodeId: reward.episode_id,
    userScore: reward.user_score,
    autoScore: reward.auto_score,
    timestamp: reward.timestamp.toISOString(),
  };
}
