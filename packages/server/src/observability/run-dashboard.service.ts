import { prisma } from "@entitlement-os/db";
import type {
  EvidenceSnapshotRecord,
  RunDashboardBucket,
  RunDashboardConfidencePoint,
  RunDashboardManifestContinuityAlert,
  RunDashboardRecentRun,
  RunDashboardReproducibilityAlert,
  RunDashboardResponse,
  RunDashboardSourceIngestionOffender,
  RunDashboardTotals,
} from "./run-dashboard.shared";
import {
  buildEvidenceFreshnessSignals,
  MAX_CONFIDENCE_BINS,
  MAX_DASHBOARD_RUNS,
  MAX_EVIDENCE_ALERT_REASONS,
  MAX_MISSING_EVIDENCE_ITEMS,
  MAX_RECENT_RUNS,
  MAX_REPRODUCIBILITY_ALERTS,
  MAX_TOOL_FAILURE_REASONS,
  parseRunOutput,
  toBucketArray,
} from "./run-dashboard.shared";

type RunRow = {
  id: string;
  runType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  openaiResponseId: string | null;
  outputJson: unknown;
};

export async function buildRunDashboard(
  orgId: string,
): Promise<RunDashboardResponse> {
  const runs = await prisma.run.findMany({
    where: { orgId },
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

  const totals: RunDashboardTotals & {
    confidenceSum: number;
    totalMissingEvidenceCount: number;
  } = {
    totalRuns: 0,
    succeededRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    canceledRuns: 0,
    evidenceCitations: 0,
    averageConfidence: null,
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
    evidenceSourcesCited: 0,
    evidenceSourcesFresh: 0,
    evidenceSourcesAging: 0,
    evidenceSourcesStale: 0,
    evidenceSourcesCritical: 0,
    evidenceSourcesUnknown: 0,
    evidenceSourcesDrifted: 0,
    evidenceSourcesWithAlerts: 0,
    evidenceCriticalAlertSources: 0,
    evidenceWarningAlertSources: 0,
    evidenceSnapshotsCited: 0,
    evidenceAverageFreshnessScore: null,
  };

  const confidenceBuckets = new Map<
    string,
    { confidenceSum: number; runCount: number }
  >();
  const runTypeCounts = new Map<string, number>();
  const retryModeCounts = new Map<string, number>();
  const retryPolicyReasonCounts = new Map<string, number>();
  const missingEvidenceCounts = new Map<string, number>();
  const toolFailureCounts = new Map<string, number>();
  const reproducibilityDriftCounts = new Map<string, number>();
  const reproducibilitySignals: RunDashboardReproducibilityAlert[] = [];
  const recentRuns: RunDashboardRecentRun[] = [];
  const reproducibilityState = new Map<string, { hash: string; runId: string }>();
  const sourceManifestState = new Map<string, { hash: string; runId: string }>();
  const citedEvidenceSourceIds = new Set<string>();
  const evidenceFreshnessStateCounts = new Map<string, number>();
  const evidenceAlertReasonCounts = new Map<string, number>();
  let evidenceFreshnessScoreSum = 0;
  const sourceIngestionOffenderByUrl = new Map<
    string,
    RunDashboardSourceIngestionOffender
  >();
  const manifestContinuitySignals: RunDashboardManifestContinuityAlert[] = [];
  const sourceManifestCounts = {
    comparisons: 0,
    drifts: 0,
    driftRate: 0 as number | null,
  };

  const parsedRunOutput = (runs as RunRow[]).map((run) => {
    const parsed = parseRunOutput(run.outputJson);
    parsed.evidenceCitations.forEach((citation) => {
      if (citation.sourceId) {
        citedEvidenceSourceIds.add(citation.sourceId);
      }
    });
    totals.evidenceSnapshotsCited += parsed.evidenceCitations.length;
    return { parsed, run };
  });

  for (const row of parsedRunOutput) {
    const { parsed, run } = row;
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

    parsed.openaiResponseId = run.openaiResponseId;
    const confidence = parsed.confidence;
    const isDecisionRun =
      run.runType === "TRIAGE" ||
      run.runType === "ENRICHMENT" ||
      run.runType === "ADVANCEMENT_CHECK";
    if (typeof confidence === "number" && isDecisionRun) {
      totals.confidenceSamples += 1;
      totals.confidenceSum += confidence;

      const bucket = run.startedAt.toISOString().slice(0, 10);
      const bucketState = confidenceBuckets.get(bucket) ?? {
        confidenceSum: 0,
        runCount: 0,
      };
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
      totals.maxRetryAttempts = Math.max(
        totals.maxRetryAttempts,
        parsed.retryAttempts,
      );
    }
    if (parsed.retryMode) {
      retryModeCounts.set(
        parsed.retryMode,
        (retryModeCounts.get(parsed.retryMode) ?? 0) + 1,
      );
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
          (retryPolicyReasonCounts.get(parsed.evidenceRetryPolicy.reason) ?? 0) +
            1,
        );
      }
    }
    if (parsed.toolFailures.length > 0) {
      totals.runsWithToolFailures += 1;
      totals.toolFailureEvents += parsed.toolFailures.length;
      parsed.toolFailures.forEach((failure) =>
        toolFailureCounts.set(
          failure,
          (toolFailureCounts.get(failure) ?? 0) + 1,
        ),
      );
    }
    if (parsed.missingEvidence.length > 0) {
      totals.runsWithMissingEvidence += 1;
      totals.totalMissingEvidenceCount += parsed.missingEvidence.length;
      parsed.missingEvidence.forEach((item) =>
        missingEvidenceCounts.set(
          item,
          (missingEvidenceCounts.get(item) ?? 0) + 1,
        ),
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
          reproducibilityDriftCounts.set(
            run.runType,
            (reproducibilityDriftCounts.get(run.runType) ?? 0) + 1,
          );
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

    if (run.runType === "SOURCE_INGEST") {
      if (parsed.sourceManifestHash !== null) {
        const existing = sourceManifestState.get("SOURCE_INGEST");
        if (existing) {
          sourceManifestCounts.comparisons += 1;
          if (existing.hash !== parsed.sourceManifestHash) {
            sourceManifestCounts.drifts += 1;
            manifestContinuitySignals.push({
              runType: run.runType,
              fromRunId: run.id,
              toRunId: existing.runId,
              previousManifestHash: existing.hash,
              currentManifestHash: parsed.sourceManifestHash,
            });
          }
        }
        sourceManifestState.set("SOURCE_INGEST", {
          hash: parsed.sourceManifestHash,
          runId: run.id,
        });
      }

      for (const offender of parsed.sourceIngestionOffenders) {
        if (!sourceIngestionOffenderByUrl.has(offender.url)) {
          sourceIngestionOffenderByUrl.set(offender.url, {
            ...offender,
            runId: run.id,
            runType: run.runType,
          });
        }
      }
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
      confidence,
      lastAgentName: parsed.lastAgentName,
      evidenceCount: parsed.evidenceCount,
      missingEvidenceCount: parsed.missingEvidence.length,
      proofChecksCount: parsed.proofChecks.length,
      retryAttempts: parsed.retryAttempts,
      retryMode: parsed.retryMode,
      fallbackTriggered:
        parsed.fallbackReason !== null || parsed.fallbackLineage.length > 0,
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

  if (citedEvidenceSourceIds.size > 0) {
    const evidenceSourceSignals = new Map<string, ReturnType<typeof buildEvidenceFreshnessSignals>>();
    const evidenceSources = await prisma.evidenceSource.findMany({
      where: {
        id: { in: [...citedEvidenceSourceIds] },
        orgId,
      },
      include: {
        evidenceSnapshots: {
          orderBy: { retrievedAt: "desc" },
          take: 2,
          select: {
            id: true,
            retrievedAt: true,
            contentHash: true,
            httpStatus: true,
          },
        },
      },
    });

    for (const source of evidenceSources as Array<{
      id: string;
      evidenceSnapshots: EvidenceSnapshotRecord[];
    }>) {
      const latestSnapshot = source.evidenceSnapshots[0] ?? null;
      const previousSnapshot = source.evidenceSnapshots[1] ?? null;
      const signal = buildEvidenceFreshnessSignals(
        latestSnapshot,
        previousSnapshot,
      );
      evidenceSourceSignals.set(source.id, signal);
      evidenceFreshnessScoreSum += signal.freshnessScore;
      evidenceFreshnessStateCounts.set(
        signal.freshnessState,
        (evidenceFreshnessStateCounts.get(signal.freshnessState) ?? 0) + 1,
      );
    }

    for (const sourceId of citedEvidenceSourceIds) {
      if (!evidenceSourceSignals.has(sourceId)) {
        const unknownSignal = buildEvidenceFreshnessSignals(null, null);
        evidenceSourceSignals.set(sourceId, unknownSignal);
        evidenceFreshnessScoreSum += unknownSignal.freshnessScore;
        evidenceFreshnessStateCounts.set(
          unknownSignal.freshnessState,
          (evidenceFreshnessStateCounts.get(unknownSignal.freshnessState) ?? 0) +
            1,
        );
      }
    }

    for (const sourceSignal of evidenceSourceSignals.values()) {
      totals.evidenceSourcesCited += 1;
      totals.evidenceSourcesFresh += sourceSignal.freshnessState === "fresh" ? 1 : 0;
      totals.evidenceSourcesAging += sourceSignal.freshnessState === "aging" ? 1 : 0;
      totals.evidenceSourcesStale += sourceSignal.freshnessState === "stale" ? 1 : 0;
      totals.evidenceSourcesCritical +=
        sourceSignal.freshnessState === "critical" ? 1 : 0;
      totals.evidenceSourcesUnknown +=
        sourceSignal.freshnessState === "unknown" ? 1 : 0;
      totals.evidenceSourcesDrifted +=
        sourceSignal.driftSignal === "changed" ? 1 : 0;
      if (sourceSignal.alertLevel === "critical") {
        totals.evidenceCriticalAlertSources += 1;
      }
      if (sourceSignal.alertLevel === "warning") {
        totals.evidenceWarningAlertSources += 1;
      }
      if (sourceSignal.alertLevel !== "none") {
        totals.evidenceSourcesWithAlerts += 1;
        sourceSignal.alertReasons.forEach((reason) =>
          evidenceAlertReasonCounts.set(
            reason,
            (evidenceAlertReasonCounts.get(reason) ?? 0) + 1,
          ),
        );
      }
    }
  }

  totals.evidenceAverageFreshnessScore =
    totals.evidenceSourcesCited > 0
      ? Math.round(
          ((evidenceFreshnessScoreSum / totals.evidenceSourcesCited) +
            Number.EPSILON) *
            100,
        ) / 100
      : null;

  const evidenceFreshnessStateDistribution = toBucketArray(
    evidenceFreshnessStateCounts,
    MAX_EVIDENCE_ALERT_REASONS,
  );
  const evidenceAlertReasonDistribution = toBucketArray(
    evidenceAlertReasonCounts,
    MAX_EVIDENCE_ALERT_REASONS,
  );

  if (totals.runsWithRetry > 0) {
    totals.averageRetryAttempts =
      Math.round(
        (totals.retryAttempts / totals.runsWithRetry + Number.EPSILON) * 100,
      ) / 100;
  }
  if (totals.runsWithRetryPolicy > 0) {
    totals.averageRetryPolicyAttempts =
      Math.round(
        ((totals.retryPolicyAttempts / totals.runsWithRetryPolicy) +
          Number.EPSILON) *
          100,
      ) / 100;
  }
  if (totals.runsWithMissingEvidence > 0) {
    totals.avgMissingEvidenceCount =
      Math.round(
        ((totals.totalMissingEvidenceCount / totals.runsWithMissingEvidence) +
          Number.EPSILON) *
          100,
      ) / 100;
  }
  if (totals.reproducibilityComparisons > 0) {
    totals.reproducibilityDriftRate =
      Math.round(
        ((totals.reproducibilityDrifts / totals.reproducibilityComparisons) +
          Number.EPSILON) *
          10000,
      ) / 10000;
  }

  sourceManifestCounts.driftRate =
    sourceManifestCounts.comparisons > 0
      ? Math.round(
          ((sourceManifestCounts.drifts / sourceManifestCounts.comparisons) +
            Number.EPSILON) *
            10000,
        ) / 10000
      : null;

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
          ? Math.round(
              (bucket.confidenceSum / bucket.runCount + Number.EPSILON) * 10000,
            ) / 10000
          : null,
    }));

  const topStaleSourceIngestionOffenders = Array.from(
    sourceIngestionOffenderByUrl.values(),
  )
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === "critical" ? -1 : b.priority === "critical" ? 1 : 0;
      }
      if (a.stalenessDays === null) return 1;
      if (b.stalenessDays === null) return -1;
      if (a.stalenessDays !== b.stalenessDays) {
        return b.stalenessDays - a.stalenessDays;
      }
      return b.qualityScore - a.qualityScore;
    })
    .slice(0, MAX_TOOL_FAILURE_REASONS);

  return {
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
          ? Math.round(
              (totals.confidenceSum / totals.confidenceSamples + Number.EPSILON) *
                10000,
            ) / 10000
          : null,
      confidenceSamples: totals.confidenceSamples,
      runsWithProofChecks: totals.runsWithProofChecks,
      runsWithRetry: totals.runsWithRetry,
      retryAttempts: totals.retryAttempts,
      maxRetryAttempts: totals.maxRetryAttempts,
      averageRetryAttempts: totals.averageRetryAttempts,
      runsWithRetryPolicy: totals.runsWithRetryPolicy,
      runsWithRetryPolicyTriggers: totals.runsWithRetryPolicyTriggers,
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
      evidenceSourcesCited: totals.evidenceSourcesCited,
      evidenceSourcesFresh: totals.evidenceSourcesFresh,
      evidenceSourcesAging: totals.evidenceSourcesAging,
      evidenceSourcesStale: totals.evidenceSourcesStale,
      evidenceSourcesCritical: totals.evidenceSourcesCritical,
      evidenceSourcesUnknown: totals.evidenceSourcesUnknown,
      evidenceSourcesDrifted: totals.evidenceSourcesDrifted,
      evidenceSourcesWithAlerts: totals.evidenceSourcesWithAlerts,
      evidenceCriticalAlertSources: totals.evidenceCriticalAlertSources,
      evidenceWarningAlertSources: totals.evidenceWarningAlertSources,
      evidenceSnapshotsCited: totals.evidenceSnapshotsCited,
      evidenceAverageFreshnessScore: totals.evidenceAverageFreshnessScore,
    },
    evidenceProfile: {
      freshnessStateDistribution: evidenceFreshnessStateDistribution,
      alertReasonDistribution: evidenceAlertReasonDistribution,
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
      topMissingEvidence: toBucketArray(
        missingEvidenceCounts,
        MAX_MISSING_EVIDENCE_ITEMS,
      ),
    },
    toolFailureProfile: {
      topToolFailureReasons: toBucketArray(
        toolFailureCounts,
        MAX_TOOL_FAILURE_REASONS,
      ),
    },
    reproducibilityProfile: {
      topDriftRunTypes: toBucketArray(
        reproducibilityDriftCounts,
        MAX_TOOL_FAILURE_REASONS,
      ),
      recentDriftAlerts: reproducibilitySignals.slice(0, MAX_REPRODUCIBILITY_ALERTS),
    },
    sourceIngestionProfile: {
      topStaleOffenders: topStaleSourceIngestionOffenders,
      manifestContinuityComparisons: sourceManifestCounts.comparisons,
      manifestContinuityDrifts: sourceManifestCounts.drifts,
      manifestContinuityDriftRate: sourceManifestCounts.driftRate,
      recentManifestContinuityAlerts: manifestContinuitySignals.slice(
        0,
        MAX_REPRODUCIBILITY_ALERTS,
      ),
    },
    recentRuns: recentRuns
      .slice()
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )
      .slice(0, MAX_RECENT_RUNS),
  };
}
