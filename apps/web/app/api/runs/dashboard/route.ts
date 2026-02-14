import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";

type RunRow = {
  id: string;
  runType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  openaiResponseId: string | null;
  outputJson: unknown;
};

type RunDashboardBucket = {
  key: string;
  count: number;
};

type RunDashboardConfidencePoint = {
  date: string;
  runCount: number;
  averageConfidence: number | null;
};

type RunDashboardTotals = {
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  runningRuns: number;
  canceledRuns: number;
  evidenceCitations: number;
  averageConfidence: number | null;
  confidenceSamples: number;
  runsWithProofChecks: number;
  runsWithRetry: number;
  retryAttempts: number;
  maxRetryAttempts: number;
  averageRetryAttempts: number;
  runsWithRetryPolicy: number;
  runsWithRetryPolicyTriggers: number;
  retryPolicyAttempts: number;
  maxRetryPolicyAttempts: number;
  averageRetryPolicyAttempts: number;
  runsWithFallback: number;
  runsWithToolFailures: number;
  toolFailureEvents: number;
  runsWithMissingEvidence: number;
  avgMissingEvidenceCount: number;
  reproducibilityComparisons: number;
  reproducibilityDrifts: number;
  reproducibilityDriftRate: number | null;
};

type RunDashboardRetryProfile = {
  retryModeDistribution: RunDashboardBucket[];
  retryPolicyReasonDistribution: RunDashboardBucket[];
};

type RunDashboardMissingEvidenceProfile = {
  topMissingEvidence: RunDashboardBucket[];
};

type RunDashboardToolFailureProfile = {
  topToolFailureReasons: RunDashboardBucket[];
};

type RunDashboardReproducibilityAlert = {
  runType: string;
  fromRunId: string;
  toRunId: string;
  hashType: string;
  previousHash: string;
  currentHash: string;
};

type RunDashboardReproducibilityProfile = {
  topDriftRunTypes: RunDashboardBucket[];
  recentDriftAlerts: RunDashboardReproducibilityAlert[];
};

type RunDashboardEvidenceRetryPolicy = {
  enabled: boolean;
  threshold: number;
  missingEvidenceCount: number;
  attempts: number;
  maxAttempts: number;
  shouldRetry: boolean;
  nextAttempt: number;
  nextRetryMode: string;
  reason: string;
};

type RunDashboardRecentRun = {
  id: string;
  runType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  confidence: number | null;
  lastAgentName: string | null;
  evidenceCount: number;
  missingEvidenceCount: number;
  proofChecksCount: number;
  retryAttempts: number;
  retryMode: string | null;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  toolFailureCount: number;
  correlationId: string | null;
  openaiResponseId: string | null;
  retryPolicyReason: string | null;
  retryPolicyAttempts: number | null;
  retryPolicyMaxAttempts: number | null;
  retryPolicyShouldRetry: boolean | null;
};

type RunDashboardResponse = {
  generatedAt: string;
  totals: RunDashboardTotals;
  confidenceTimeline: RunDashboardConfidencePoint[];
  runTypeDistribution: RunDashboardBucket[];
  retryProfile: RunDashboardRetryProfile;
  missingEvidenceProfile: RunDashboardMissingEvidenceProfile;
  toolFailureProfile: RunDashboardToolFailureProfile;
  reproducibilityProfile: RunDashboardReproducibilityProfile;
  recentRuns: RunDashboardRecentRun[];
};

const MAX_DASHBOARD_RUNS = 500;
const MAX_CONFIDENCE_BINS = 14;
const MAX_TOOL_FAILURE_REASONS = 10;
const MAX_MISSING_EVIDENCE_ITEMS = 10;
const MAX_RECENT_RUNS = 20;
const MAX_REPRODUCIBILITY_ALERTS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return NaN;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function parseEvidenceRetryPolicy(
  value: unknown,
): RunDashboardEvidenceRetryPolicy | null {
  if (!isRecord(value)) {
    return null;
  }

  const reason = typeof value.reason === "string" ? value.reason : "";

  const hasPolicySignal =
    value.enabled !== undefined ||
    value.threshold !== undefined ||
    value.missingEvidenceCount !== undefined ||
    value.attempts !== undefined ||
    value.maxAttempts !== undefined ||
    value.shouldRetry !== undefined ||
    value.nextAttempt !== undefined ||
    value.nextRetryMode !== undefined ||
    reason.length > 0;

  if (!hasPolicySignal) {
    return null;
  }

  const attempts = toNumber(value.attempts);
  const maxAttempts = toNumber(value.maxAttempts);
  const threshold = toNumber(value.threshold);
  const missingEvidenceCount = toNumber(value.missingEvidenceCount);
  const nextAttempt = toNumber(value.nextAttempt);

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    threshold: Number.isFinite(threshold) ? threshold : 0,
    missingEvidenceCount: Number.isFinite(missingEvidenceCount) ? missingEvidenceCount : 0,
    attempts: Number.isFinite(attempts) ? attempts : 0,
    maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 0,
    shouldRetry: parseBoolean(value.shouldRetry) ?? false,
    nextAttempt: Number.isFinite(nextAttempt) ? nextAttempt : 0,
    nextRetryMode:
      typeof value.nextRetryMode === "string" ? value.nextRetryMode : "none",
    reason,
  };
}

function sortBucketsByCountAndLabel(a: RunDashboardBucket, b: RunDashboardBucket) {
  if (b.count !== a.count) return b.count - a.count;
  return a.key.localeCompare(b.key);
}

function toBucketArray(map: Map<string, number>, limit: number): RunDashboardBucket[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort(sortBucketsByCountAndLabel)
    .slice(0, limit);
}

type ParsedOutput = {
  status: string | null;
  confidence: number | null;
  lastAgentName: string | null;
  openaiResponseId: string | null;
  evidenceCount: number;
  missingEvidence: string[];
  proofChecks: string[];
  retryAttempts: number;
  retryMaxAttempts: number;
  retryMode: string | null;
  fallbackLineage: string[];
  fallbackReason: string | null;
  toolFailures: string[];
  sourceManifestHash: string | null;
  evidenceHash: string | null;
  runInputHash: string | null;
  correlationId: string | null;
  evidenceRetryPolicy: RunDashboardEvidenceRetryPolicy | null;
  continuityHashType: string | null;
  continuityHash: string | null;
};

function parseRunOutput(outputJson: unknown): ParsedOutput {
  const output = isRecord(outputJson) ? outputJson : null;
  const runState = isRecord(output?.runState) ? output.runState : null;

  const confidence = toNumber(
    output?.[AGENT_RUN_STATE_KEYS.confidence] ?? runState?.[AGENT_RUN_STATE_KEYS.confidence],
  );
  const lastAgentName = typeof output?.[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
    ? String(output[AGENT_RUN_STATE_KEYS.lastAgentName])
    : typeof runState?.[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
      ? String(runState[AGENT_RUN_STATE_KEYS.lastAgentName])
      : null;

  const status = typeof output?.[AGENT_RUN_STATE_KEYS.status] === "string"
    ? String(output[AGENT_RUN_STATE_KEYS.status])
    : typeof runState?.[AGENT_RUN_STATE_KEYS.status] === "string"
      ? String(runState[AGENT_RUN_STATE_KEYS.status])
      : null;

  const evidenceCitations = isRecord(output)
    ? output.evidenceCitations
    : null;
  const evidenceCount = Array.isArray(evidenceCitations) ? evidenceCitations.length : 0;
  const sourceManifestHash =
    typeof output?.sourceManifestHash === "string" ? output.sourceManifestHash : null;
  const evidenceHash =
    typeof output?.evidenceHash === "string" ? output.evidenceHash : null;
  const runInputHash =
    typeof output?.runInputHash === "string"
      ? output.runInputHash
      : typeof runState?.[AGENT_RUN_STATE_KEYS.runInputHash] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.runInputHash])
        : null;

  const continuityHashType =
    sourceManifestHash !== null
      ? "sourceManifestHash"
      : evidenceHash !== null
        ? "evidenceHash"
        : null;

  const missingEvidence = toStringArray(
    output?.[AGENT_RUN_STATE_KEYS.missingEvidence] ??
      runState?.[AGENT_RUN_STATE_KEYS.missingEvidence],
  );
  const proofChecks = toStringArray(
    output?.proofChecks ??
      output?.[AGENT_RUN_STATE_KEYS.proofChecks] ??
      runState?.[AGENT_RUN_STATE_KEYS.proofChecks],
  );
  const toolFailures = toStringArray(
    output?.toolFailures ??
      output?.[AGENT_RUN_STATE_KEYS.toolFailures] ??
      runState?.[AGENT_RUN_STATE_KEYS.toolFailures],
  );

  const retryAttemptsValue = toNumber(
    output?.retryAttempts ??
      output?.[AGENT_RUN_STATE_KEYS.retryAttempts] ??
      runState?.[AGENT_RUN_STATE_KEYS.retryAttempts],
  );
  const retryMaxAttemptsValue = toNumber(
    output?.retryMaxAttempts ??
      output?.[AGENT_RUN_STATE_KEYS.retryMaxAttempts] ??
      runState?.[AGENT_RUN_STATE_KEYS.retryMaxAttempts],
  );

  const retryMode =
    typeof output?.retryMode === "string"
      ? output.retryMode
      : typeof output?.[AGENT_RUN_STATE_KEYS.retryMode] === "string"
        ? String(output[AGENT_RUN_STATE_KEYS.retryMode])
        : typeof runState?.[AGENT_RUN_STATE_KEYS.retryMode] === "string"
          ? String(runState[AGENT_RUN_STATE_KEYS.retryMode])
          : null;

  const fallbackReason =
    typeof output?.fallbackReason === "string"
      ? output.fallbackReason
      : typeof output?.[AGENT_RUN_STATE_KEYS.fallbackReason] === "string"
        ? String(output[AGENT_RUN_STATE_KEYS.fallbackReason])
        : typeof runState?.[AGENT_RUN_STATE_KEYS.fallbackReason] === "string"
          ? String(runState[AGENT_RUN_STATE_KEYS.fallbackReason])
          : null;

  const fallbackLineage = toStringArray(
    output?.fallbackLineage ??
    output?.[AGENT_RUN_STATE_KEYS.fallbackLineage] ??
    runState?.[AGENT_RUN_STATE_KEYS.fallbackLineage],
  );
  const correlationId =
    typeof output?.[AGENT_RUN_STATE_KEYS.correlationId] === "string"
      ? String(output[AGENT_RUN_STATE_KEYS.correlationId])
      : typeof runState?.[AGENT_RUN_STATE_KEYS.correlationId] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.correlationId])
        : null;
  const evidenceRetryPolicy = parseEvidenceRetryPolicy(
    output?.evidenceRetryPolicy ??
      (runState && typeof runState.evidenceRetryPolicy === "object"
        ? runState.evidenceRetryPolicy
        : undefined),
  );

  return {
    status,
    confidence: Number.isFinite(confidence) ? confidence : null,
    lastAgentName,
    openaiResponseId: null,
    evidenceCount,
    missingEvidence,
    proofChecks,
    retryAttempts: Number.isFinite(retryAttemptsValue) ? retryAttemptsValue : 0,
    retryMaxAttempts: Number.isFinite(retryMaxAttemptsValue) ? retryMaxAttemptsValue : 0,
    retryMode,
    fallbackLineage,
    fallbackReason,
    toolFailures,
    correlationId,
    evidenceRetryPolicy,
    sourceManifestHash,
    evidenceHash,
    runInputHash,
    continuityHashType,
    continuityHash: sourceManifestHash ?? evidenceHash,
  };
}

// GET /api/runs/dashboard - aggregate run state metrics for agent dashboard
export async function GET(_request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const runs = await prisma.run.findMany({
      where: { orgId: auth.orgId },
      orderBy: { startedAt: "desc" },
      take: MAX_DASHBOARD_RUNS,
      select: {
        id: true,
        runType: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        openaiResponseId: true,
        outputJson: true,
      },
    });

    const totals = {
      totalRuns: 0,
      succeededRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      canceledRuns: 0,
      evidenceCitations: 0,
      confidenceSamples: 0,
      confidenceSum: 0,
      runsWithProofChecks: 0,
      runsWithRetry: 0,
      retryAttempts: 0,
      maxRetryAttempts: 0,
      averageRetryAttempts: 0,
      runsWithRetryPolicy: 0,
      runsWithRetryPolicyTriggers: 0,
      retryPolicyAttempts: 0,
      maxRetryPolicyAttempts: 0,
      averageRetryPolicyAttempts: 0,
      runsWithFallback: 0,
      runsWithToolFailures: 0,
      toolFailureEvents: 0,
      runsWithMissingEvidence: 0,
      avgMissingEvidenceCount: 0,
      totalMissingEvidenceCount: 0,
      reproducibilityComparisons: 0,
      reproducibilityDrifts: 0,
      reproducibilityDriftRate: 0,
    };

    const confidenceBuckets = new Map<string, { confidenceSum: number; runCount: number }>();
    const runTypeCounts = new Map<string, number>();
    const retryModeCounts = new Map<string, number>();
    const retryPolicyReasonCounts = new Map<string, number>();
    const missingEvidenceCounts = new Map<string, number>();
    const toolFailureCounts = new Map<string, number>();
    const reproducibilityDriftCounts = new Map<string, number>();
    const reproducibilitySignals: RunDashboardReproducibilityAlert[] = [];
    const recentRuns: RunDashboardRecentRun[] = [];
    const reproducibilityState = new Map<string, { hash: string; runId: string }>();

    for (const run of runs as RunRow[]) {
      totals.totalRuns += 1;

      switch (run.status) {
        case "succeeded":
          totals.succeededRuns += 1;
          break;
        case "failed":
          totals.failedRuns += 1;
          break;
        case "running":
          totals.runningRuns += 1;
          break;
        case "canceled":
          totals.canceledRuns += 1;
          break;
      }

      const parsed = parseRunOutput(run.outputJson);
      parsed.openaiResponseId = run.openaiResponseId;
      const confidence = parsed.confidence;
      if (typeof confidence === "number") {
        totals.confidenceSamples += 1;
        totals.confidenceSum += confidence;

        const bucket = run.startedAt.toISOString().slice(0, 10);
        const bucketState = confidenceBuckets.get(bucket) ??
          { confidenceSum: 0, runCount: 0 };
        bucketState.confidenceSum += confidence;
        bucketState.runCount += 1;
        confidenceBuckets.set(bucket, bucketState);
      }

      runTypeCounts.set(run.runType, (runTypeCounts.get(run.runType) ?? 0) + 1);
      totals.evidenceCitations += parsed.evidenceCount;

      if (parsed.proofChecks.length > 0) {
        totals.runsWithProofChecks += 1;
      }
      if (parsed.retryAttempts > 0) {
        totals.runsWithRetry += 1;
        totals.retryAttempts += parsed.retryAttempts;
        totals.maxRetryAttempts = Math.max(totals.maxRetryAttempts, parsed.retryAttempts);
      }
      if (parsed.retryMode) {
        retryModeCounts.set(parsed.retryMode, (retryModeCounts.get(parsed.retryMode) ?? 0) + 1);
      }
      if (parsed.fallbackReason !== null || parsed.fallbackLineage.length > 0) {
        totals.runsWithFallback += 1;
      }
      if (parsed.evidenceRetryPolicy !== null) {
        totals.runsWithRetryPolicy += 1;
        totals.retryPolicyAttempts += parsed.evidenceRetryPolicy.attempts;
        totals.maxRetryPolicyAttempts = Math.max(
          totals.maxRetryPolicyAttempts,
          parsed.evidenceRetryPolicy.maxAttempts,
        );
        if (parsed.evidenceRetryPolicy.shouldRetry) {
          totals.runsWithRetryPolicyTriggers += 1;
        }
        if (parsed.evidenceRetryPolicy.reason) {
          retryPolicyReasonCounts.set(
            parsed.evidenceRetryPolicy.reason,
            (retryPolicyReasonCounts.get(parsed.evidenceRetryPolicy.reason) ?? 0) + 1,
          );
        }
      }
      if (parsed.toolFailures.length > 0) {
        totals.runsWithToolFailures += 1;
        totals.toolFailureEvents += parsed.toolFailures.length;
        parsed.toolFailures.forEach((failure) =>
          toolFailureCounts.set(failure, (toolFailureCounts.get(failure) ?? 0) + 1)
        );
      }
      if (parsed.missingEvidence.length > 0) {
        totals.runsWithMissingEvidence += 1;
        totals.totalMissingEvidenceCount += parsed.missingEvidence.length;
        parsed.missingEvidence.forEach((item) =>
          missingEvidenceCounts.set(item, (missingEvidenceCounts.get(item) ?? 0) + 1)
        );
      }
      if (parsed.continuityHash) {
        const continuityKey =
          parsed.runInputHash !== null
            ? `${run.runType}::${parsed.runInputHash}`
            : `${run.runType}`;
        const prior = reproducibilityState.get(continuityKey);

        if (prior) {
          totals.reproducibilityComparisons += 1;
          if (prior.hash !== parsed.continuityHash) {
            totals.reproducibilityDrifts += 1;
            reproducibilityDriftCounts.set(run.runType, (reproducibilityDriftCounts.get(run.runType) ?? 0) + 1);
            reproducibilitySignals.push({
              runType: run.runType,
              fromRunId: run.id,
              toRunId: prior.runId,
              hashType: parsed.continuityHashType ?? "unknown",
              previousHash: prior.hash,
              currentHash: parsed.continuityHash,
            });
          }
        }

        reproducibilityState.set(continuityKey, {
          hash: parsed.continuityHash,
          runId: run.id,
        });
      }

      const durationMs = run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null;
      recentRuns.push({
        id: run.id,
        runType: run.runType,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs,
        confidence: confidence,
        lastAgentName: parsed.lastAgentName,
        evidenceCount: parsed.evidenceCount,
        missingEvidenceCount: parsed.missingEvidence.length,
        proofChecksCount: parsed.proofChecks.length,
        retryAttempts: parsed.retryAttempts,
        retryMode: parsed.retryMode,
        fallbackTriggered: parsed.fallbackReason !== null || parsed.fallbackLineage.length > 0,
        fallbackReason: parsed.fallbackReason,
        toolFailureCount: parsed.toolFailures.length,
        correlationId: parsed.correlationId,
        openaiResponseId: parsed.openaiResponseId,
        retryPolicyReason: parsed.evidenceRetryPolicy?.reason ?? null,
        retryPolicyAttempts: parsed.evidenceRetryPolicy?.attempts ?? null,
        retryPolicyMaxAttempts: parsed.evidenceRetryPolicy?.maxAttempts ?? null,
        retryPolicyShouldRetry: parsed.evidenceRetryPolicy?.shouldRetry ?? null,
      });
    }

    if (totals.runsWithRetry > 0) {
      totals.averageRetryAttempts = Math.round(
        ((totals.retryAttempts / totals.runsWithRetry) + Number.EPSILON) * 100,
      ) / 100;
    }
    if (totals.runsWithRetryPolicy > 0) {
      totals.averageRetryPolicyAttempts = Math.round(
        ((totals.retryPolicyAttempts / totals.runsWithRetryPolicy) + Number.EPSILON) *
          100,
      ) / 100;
    }
    if (totals.runsWithMissingEvidence > 0) {
      totals.avgMissingEvidenceCount = Math.round(
        ((totals.totalMissingEvidenceCount / totals.runsWithMissingEvidence) + Number.EPSILON) * 100,
      ) / 100;
    }
    if (totals.reproducibilityComparisons > 0) {
      totals.reproducibilityDriftRate = Math.round(
        ((totals.reproducibilityDrifts / totals.reproducibilityComparisons) + Number.EPSILON) * 10000,
      ) / 10000;
    }

    const confidenceTimeline: RunDashboardConfidencePoint[] = Array.from(
      confidenceBuckets.entries(),
    )
      .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
      .slice(-MAX_CONFIDENCE_BINS)
      .map(([date, bucket]) => ({
        date,
        runCount: bucket.runCount,
        averageConfidence:
          bucket.runCount > 0
            ? Math.round((bucket.confidenceSum / bucket.runCount + Number.EPSILON) * 10000) /
              10000
            : null,
      }));

    const payload: RunDashboardResponse = {
      generatedAt: new Date().toISOString(),
      totals: {
        totalRuns: totals.totalRuns,
        succeededRuns: totals.succeededRuns,
        failedRuns: totals.failedRuns,
        runningRuns: totals.runningRuns,
        canceledRuns: totals.canceledRuns,
        evidenceCitations: totals.evidenceCitations,
        averageConfidence:
          totals.confidenceSamples > 0
            ? Math.round((totals.confidenceSum / totals.confidenceSamples + Number.EPSILON) * 10000) /
              10000
            : null,
        confidenceSamples: totals.confidenceSamples,
        runsWithProofChecks: totals.runsWithProofChecks,
        runsWithRetry: totals.runsWithRetry,
        runsWithRetryPolicy: totals.runsWithRetryPolicy,
        runsWithRetryPolicyTriggers: totals.runsWithRetryPolicyTriggers,
        retryAttempts: totals.retryAttempts,
        maxRetryAttempts: totals.maxRetryAttempts,
        averageRetryAttempts: totals.averageRetryAttempts,
        retryPolicyAttempts: totals.retryPolicyAttempts,
        maxRetryPolicyAttempts: totals.maxRetryPolicyAttempts,
        averageRetryPolicyAttempts: totals.averageRetryPolicyAttempts,
        runsWithFallback: totals.runsWithFallback,
        runsWithToolFailures: totals.runsWithToolFailures,
        toolFailureEvents: totals.toolFailureEvents,
        runsWithMissingEvidence: totals.runsWithMissingEvidence,
        avgMissingEvidenceCount: totals.avgMissingEvidenceCount,
        reproducibilityComparisons: totals.reproducibilityComparisons,
        reproducibilityDrifts: totals.reproducibilityDrifts,
        reproducibilityDriftRate: totals.reproducibilityDriftRate,
      },
      confidenceTimeline,
      runTypeDistribution: toBucketArray(runTypeCounts, MAX_DASHBOARD_RUNS),
      retryProfile: {
        retryModeDistribution: toBucketArray(retryModeCounts, MAX_DASHBOARD_RUNS),
        retryPolicyReasonDistribution: toBucketArray(
          retryPolicyReasonCounts,
          MAX_TOOL_FAILURE_REASONS,
        ),
      },
      missingEvidenceProfile: {
        topMissingEvidence: toBucketArray(missingEvidenceCounts, MAX_MISSING_EVIDENCE_ITEMS),
      },
      toolFailureProfile: {
        topToolFailureReasons: toBucketArray(toolFailureCounts, MAX_TOOL_FAILURE_REASONS),
      },
      reproducibilityProfile: {
        topDriftRunTypes: toBucketArray(reproducibilityDriftCounts, MAX_TOOL_FAILURE_REASONS),
        recentDriftAlerts: reproducibilitySignals
          .slice(0, MAX_REPRODUCIBILITY_ALERTS),
      },
      recentRuns: recentRuns
        .slice()
        .sort((a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, MAX_RECENT_RUNS),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error building run dashboard", error);
    return NextResponse.json(
      { error: "Failed to build run dashboard" },
      { status: 500 },
    );
  }
}
