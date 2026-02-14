import useSWR from "swr";

import { useMemo } from "react";

export interface RunDashboardBucket {
  key: string;
  count: number;
}

export interface RunDashboardTotals {
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
  runsWithRetryPolicy: number;
  runsWithRetryPolicyTriggers: number;
  retryPolicyAttempts: number;
  maxRetryPolicyAttempts: number;
  averageRetryPolicyAttempts: number;
  retryAttempts: number;
  maxRetryAttempts: number;
  averageRetryAttempts: number;
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
}

export interface RunDashboardRetryProfile {
  retryModeDistribution: RunDashboardBucket[];
  retryPolicyReasonDistribution: RunDashboardBucket[];
}

export interface RunDashboardMissingEvidenceProfile {
  topMissingEvidence: RunDashboardBucket[];
}

export interface RunDashboardToolFailureProfile {
  topToolFailureReasons: RunDashboardBucket[];
}

export interface RunDashboardReproducibilityAlert {
  runType: string;
  fromRunId: string;
  toRunId: string;
  hashType: string;
  previousHash: string;
  currentHash: string;
}

export interface RunDashboardReproducibilityProfile {
  topDriftRunTypes: RunDashboardBucket[];
  recentDriftAlerts: RunDashboardReproducibilityAlert[];
}

export interface RunDashboardEvidenceProfile {
  freshnessStateDistribution: RunDashboardBucket[];
  alertReasonDistribution: RunDashboardBucket[];
}

export interface RunDashboardRecentRun {
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
}

export interface RunDashboardPayload {
  generatedAt: string;
  totals: RunDashboardTotals;
  confidenceTimeline: Array<{
    date: string;
    runCount: number;
    averageConfidence: number | null;
  }>;
  runTypeDistribution: RunDashboardBucket[];
  retryProfile: RunDashboardRetryProfile;
  missingEvidenceProfile: RunDashboardMissingEvidenceProfile;
  toolFailureProfile: RunDashboardToolFailureProfile;
  reproducibilityProfile: RunDashboardReproducibilityProfile;
  evidenceProfile: RunDashboardEvidenceProfile;
  recentRuns: RunDashboardRecentRun[];
}

export interface UseRunDashboardOptions {
  runLimit?: number;
  refreshIntervalMs?: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useRunDashboard(options: UseRunDashboardOptions = {}) {
  const { runLimit, refreshIntervalMs } = options;
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (typeof runLimit === "number" && Number.isFinite(runLimit)) {
      params.set("limit", String(Math.max(1, Math.min(runLimit, 500))));
    }
    return params.toString();
  }, [runLimit]);

  const endpoint = `/api/runs/dashboard${query ? `?${query}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<RunDashboardPayload>(endpoint, fetcher, {
    refreshInterval: refreshIntervalMs,
    dedupingInterval: refreshIntervalMs ? Math.min(refreshIntervalMs, 5000) : undefined,
  });

  return {
    dashboard: data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
