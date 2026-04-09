import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";

export type EvidenceFreshnessState =
  | "fresh"
  | "aging"
  | "stale"
  | "critical"
  | "unknown";

export type EvidenceDriftSignal = "stable" | "changed" | "insufficient";
export type EvidenceAlertLevel = "none" | "warning" | "critical";

export type EvidenceSnapshotRecord = {
  id: string;
  retrievedAt: Date;
  httpStatus: number;
  contentHash: string;
};

export type EvidenceCitationRef = {
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
};

export type EvidenceSourceFreshnessSignal = {
  freshnessScore: number;
  freshnessState: EvidenceFreshnessState;
  driftSignal: EvidenceDriftSignal;
  alertLevel: EvidenceAlertLevel;
  alertReasons: string[];
};

export type RunDashboardBucket = {
  key: string;
  count: number;
};

export type RunDashboardConfidencePoint = {
  date: string;
  runCount: number;
  averageConfidence: number | null;
};

export type RunDashboardTotals = {
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
  evidenceSourcesCited: number;
  evidenceSourcesFresh: number;
  evidenceSourcesAging: number;
  evidenceSourcesStale: number;
  evidenceSourcesCritical: number;
  evidenceSourcesUnknown: number;
  evidenceSourcesDrifted: number;
  evidenceSourcesWithAlerts: number;
  evidenceCriticalAlertSources: number;
  evidenceWarningAlertSources: number;
  evidenceSnapshotsCited: number;
  evidenceAverageFreshnessScore: number | null;
};

export type RunDashboardRetryProfile = {
  retryModeDistribution: RunDashboardBucket[];
  retryPolicyReasonDistribution: RunDashboardBucket[];
};

export type RunDashboardMissingEvidenceProfile = {
  topMissingEvidence: RunDashboardBucket[];
};

export type RunDashboardToolFailureProfile = {
  topToolFailureReasons: RunDashboardBucket[];
};

export type RunDashboardReproducibilityAlert = {
  runType: string;
  fromRunId: string;
  toRunId: string;
  hashType: string;
  previousHash: string;
  currentHash: string;
};

export type RunDashboardReproducibilityProfile = {
  topDriftRunTypes: RunDashboardBucket[];
  recentDriftAlerts: RunDashboardReproducibilityAlert[];
};

export type RunDashboardSourceIngestionOffender = {
  runId: string;
  runType: string;
  url: string;
  jurisdictionName: string;
  stalenessDays: number | null;
  qualityScore: number;
  qualityBucket: string;
  priority: string;
  alertReasons: string[];
  captureSuccess: boolean;
};

export type RunDashboardManifestContinuityAlert = {
  runType: string;
  fromRunId: string;
  toRunId: string;
  previousManifestHash: string;
  currentManifestHash: string;
};

export type RunDashboardSourceIngestionProfile = {
  topStaleOffenders: RunDashboardSourceIngestionOffender[];
  manifestContinuityComparisons: number;
  manifestContinuityDrifts: number;
  manifestContinuityDriftRate: number | null;
  recentManifestContinuityAlerts: RunDashboardManifestContinuityAlert[];
};

export type RunDashboardEvidenceProfile = {
  freshnessStateDistribution: RunDashboardBucket[];
  alertReasonDistribution: RunDashboardBucket[];
};

export type RunDashboardEvidenceRetryPolicy = {
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

export type RunDashboardRecentRun = {
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
  localLeaseState: "none" | "active" | "stale" | "released";
  localLeaseAgeMs: number | null;
};

export type RunDashboardResponse = {
  generatedAt: string;
  totals: RunDashboardTotals;
  confidenceTimeline: RunDashboardConfidencePoint[];
  runTypeDistribution: RunDashboardBucket[];
  retryProfile: RunDashboardRetryProfile;
  missingEvidenceProfile: RunDashboardMissingEvidenceProfile;
  toolFailureProfile: RunDashboardToolFailureProfile;
  evidenceProfile: RunDashboardEvidenceProfile;
  reproducibilityProfile: RunDashboardReproducibilityProfile;
  sourceIngestionProfile: RunDashboardSourceIngestionProfile;
  recentRuns: RunDashboardRecentRun[];
};

export type ParsedOutput = {
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
  evidenceCitations: EvidenceCitationRef[];
  sourceIngestionOffenders: RunDashboardSourceIngestionOffender[];
};

export const MAX_DASHBOARD_RUNS = 500;
export const MAX_CONFIDENCE_BINS = 14;
export const MAX_TOOL_FAILURE_REASONS = 10;
export const MAX_MISSING_EVIDENCE_ITEMS = 10;
export const MAX_RECENT_RUNS = 20;
export const MAX_REPRODUCIBILITY_ALERTS = 8;
export const MAX_EVIDENCE_ALERT_REASONS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
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
  return Number.NaN;
}

function freshnessStateFromHours(
  hoursSinceCapture: number,
): EvidenceFreshnessState {
  if (Number.isNaN(hoursSinceCapture) || !Number.isFinite(hoursSinceCapture)) {
    return "unknown";
  }
  if (hoursSinceCapture <= 24) return "fresh";
  if (hoursSinceCapture <= 72) return "aging";
  if (hoursSinceCapture <= 168) return "stale";
  return "critical";
}

function freshnessScoreFromState(
  hoursSinceCapture: number,
  state: EvidenceFreshnessState,
): number {
  if (Number.isNaN(hoursSinceCapture) || !Number.isFinite(hoursSinceCapture)) {
    return 0;
  }
  if (state === "fresh") return 100;
  if (state === "aging") return 80;
  if (state === "stale") return 45;
  if (state === "critical") return 20;
  return 0;
}

export function buildEvidenceFreshnessSignals(
  latestSnapshot?: EvidenceSnapshotRecord | null,
  previousSnapshot?: EvidenceSnapshotRecord | null,
): EvidenceSourceFreshnessSignal {
  if (!latestSnapshot) {
    return {
      freshnessScore: 0,
      freshnessState: "unknown",
      driftSignal: "insufficient",
      alertLevel: "critical",
      alertReasons: ["No evidence snapshots available for this source."],
    };
  }

  const nowMs = Date.now();
  const hoursSinceCapture =
    (nowMs - latestSnapshot.retrievedAt.getTime()) / (1000 * 60 * 60);
  const freshnessState = freshnessStateFromHours(hoursSinceCapture);
  const alertReasons: string[] = [];

  if (latestSnapshot.httpStatus >= 500) {
    alertReasons.push("Latest capture returned a server error.");
  } else if (latestSnapshot.httpStatus >= 400) {
    alertReasons.push("Latest capture returned a non-successful status.");
  }

  if (freshnessState === "critical") {
    alertReasons.push("Evidence source has become critically stale.");
  } else if (freshnessState === "stale") {
    alertReasons.push("Evidence source freshness is declining.");
  }

  const driftSignal: EvidenceDriftSignal =
    previousSnapshot == null
      ? "insufficient"
      : latestSnapshot.contentHash === previousSnapshot.contentHash
        ? "stable"
        : "changed";

  if (driftSignal === "changed") {
    alertReasons.push("Content hash drift detected from previous snapshot.");
  }

  const alertLevel: EvidenceAlertLevel =
    freshnessState === "critical" || latestSnapshot.httpStatus >= 500
      ? "critical"
      : alertReasons.length > 0
        ? "warning"
        : "none";

  return {
    freshnessScore: freshnessScoreFromState(hoursSinceCapture, freshnessState),
    freshnessState,
    driftSignal,
    alertLevel,
    alertReasons,
  };
}

function parseEvidenceCitations(value: unknown): EvidenceCitationRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): EvidenceCitationRef | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const sourceId =
        typeof entry.sourceId === "string"
          ? entry.sourceId
          : typeof entry.source === "string"
            ? entry.source
            : undefined;
      const snapshotId =
        typeof entry.snapshotId === "string" ? entry.snapshotId : undefined;
      const contentHash =
        typeof entry.contentHash === "string" ? entry.contentHash : undefined;

      if (!sourceId && !snapshotId && !contentHash) {
        return null;
      }

      return { sourceId, snapshotId, contentHash };
    })
    .filter((citation): citation is EvidenceCitationRef => citation !== null);
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
    missingEvidenceCount: Number.isFinite(missingEvidenceCount)
      ? missingEvidenceCount
      : 0,
    attempts: Number.isFinite(attempts) ? attempts : 0,
    maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 0,
    shouldRetry: parseBoolean(value.shouldRetry) ?? false,
    nextAttempt: Number.isFinite(nextAttempt) ? nextAttempt : 0,
    nextRetryMode:
      typeof value.nextRetryMode === "string" ? value.nextRetryMode : "none",
    reason,
  };
}

export function sortBucketsByCountAndLabel(
  a: RunDashboardBucket,
  b: RunDashboardBucket,
) {
  if (b.count !== a.count) return b.count - a.count;
  return a.key.localeCompare(b.key);
}

export function toBucketArray(
  map: Map<string, number>,
  limit: number,
): RunDashboardBucket[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort(sortBucketsByCountAndLabel)
    .slice(0, limit);
}

function parseSourceIngestionOffenders(
  value: unknown,
): RunDashboardSourceIngestionOffender[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): RunDashboardSourceIngestionOffender | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const stalenessDaysValue = toNumber(entry.stalenessDays);
      const qualityScore = toNumber(entry.qualityScore);

      if (typeof entry.url !== "string" || entry.url.length === 0) {
        return null;
      }
      if (typeof entry.jurisdictionName !== "string") {
        return null;
      }

      return {
        runId: "",
        runType: "",
        url: entry.url,
        jurisdictionName: entry.jurisdictionName,
        stalenessDays: Number.isFinite(stalenessDaysValue)
          ? stalenessDaysValue
          : null,
        qualityScore: Number.isFinite(qualityScore) ? qualityScore : 0,
        qualityBucket:
          typeof entry.qualityBucket === "string" ? entry.qualityBucket : "unknown",
        priority: typeof entry.priority === "string" ? entry.priority : "warning",
        alertReasons: toStringArray(entry.alertReasons),
        captureSuccess: entry.captureSuccess === true,
      };
    })
    .filter((offender): offender is RunDashboardSourceIngestionOffender => offender !== null);
}

export function parseRunOutput(outputJson: unknown): ParsedOutput {
  const output = isRecord(outputJson) ? outputJson : null;
  const runState = isRecord(output?.runState) ? output.runState : null;

  const confidence = toNumber(
    output?.[AGENT_RUN_STATE_KEYS.confidence] ??
      runState?.[AGENT_RUN_STATE_KEYS.confidence],
  );
  const lastAgentName =
    typeof output?.[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
      ? String(output[AGENT_RUN_STATE_KEYS.lastAgentName])
      : typeof runState?.[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.lastAgentName])
        : null;

  const status =
    typeof output?.[AGENT_RUN_STATE_KEYS.status] === "string"
      ? String(output[AGENT_RUN_STATE_KEYS.status])
      : typeof runState?.[AGENT_RUN_STATE_KEYS.status] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.status])
        : null;

  const evidenceCitations = parseEvidenceCitations(output?.evidenceCitations ?? null);
  const evidenceCount = evidenceCitations.length;
  const sourceManifestHash =
    typeof output?.sourceManifestHash === "string"
      ? output.sourceManifestHash
      : null;
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
    retryMaxAttempts: Number.isFinite(retryMaxAttemptsValue)
      ? retryMaxAttemptsValue
      : 0,
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
    evidenceCitations,
    sourceIngestionOffenders: parseSourceIngestionOffenders(
      output?.staleSourceOffenders,
    ),
  };
}
