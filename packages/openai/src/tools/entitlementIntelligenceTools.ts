import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import {
  computeEntitlementPathPredictions,
} from "@entitlement-os/shared";
import { hashJsonSha256 } from "@entitlement-os/shared/crypto";

const skuSchema = z.enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"]);
const decisionSchema = z.enum([
  "approved",
  "approved_with_conditions",
  "denied",
  "withdrawn",
]);

type DecisionType = z.infer<typeof decisionSchema>;
type FeaturePrecedentRecord = {
  strategyKey: string;
  strategyLabel: string;
  decision: DecisionType;
  timelineDays: number | null;
  submittedAt: Date | null;
  decisionAt: Date | null;
  confidence: number;
  riskFlags: string[];
  hearingBody: string | null;
  applicationType: string | null;
};

type FeatureNodeRecord = {
  id: string;
  nodeType: string;
  nodeKey: string;
  label: string;
};

type FeatureEdgeRecord = {
  edgeType: string;
  weight: number;
  fromNodeId: string;
  toNodeId: string;
};

type KpiSnapshotRecord = {
  strategyKey: string;
  strategyLabel: string;
  probabilityApproval: number;
  expectedDaysP50: number;
  createdAt: Date;
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? null;
}

function deriveTimelineDays(
  timelineDays: number | null | undefined,
  submittedAt: Date | null,
  decisionAt: Date | null,
): number | null {
  if (typeof timelineDays === "number" && Number.isFinite(timelineDays) && timelineDays > 0) {
    return Math.round(timelineDays);
  }
  if (!submittedAt || !decisionAt) return null;
  const diffMs = decisionAt.getTime() - submittedAt.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 86_400_000);
}

function normalizeGroupKey(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
}

function toDateIso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function isApprovalDecision(decision: DecisionType): boolean {
  return decision === "approved" || decision === "approved_with_conditions";
}

function buildGroupedFeatureRows(
  records: FeaturePrecedentRecord[],
  minSampleSize: number,
  groupBy: (record: FeaturePrecedentRecord) => { groupKey: string; groupLabel: string },
) {
  const grouped = new Map<string, { groupLabel: string; records: FeaturePrecedentRecord[] }>();
  for (const record of records) {
    const { groupKey, groupLabel } = groupBy(record);
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.records.push(record);
      if (!bucket.groupLabel && groupLabel) bucket.groupLabel = groupLabel;
      continue;
    }
    grouped.set(groupKey, { groupLabel, records: [record] });
  }

  return [...grouped.entries()]
    .map(([groupKey, bucket]) => {
      if (bucket.records.length < minSampleSize) return null;

      let approvals = 0;
      let approvedWithConditions = 0;
      let denials = 0;
      let withdrawn = 0;
      const timelines: number[] = [];
      const confidenceValues: number[] = [];
      const riskCounts = new Map<string, number>();
      let latestDecisionAt: Date | null = null;

      for (const record of bucket.records) {
        if (record.decision === "approved") approvals += 1;
        else if (record.decision === "approved_with_conditions") approvedWithConditions += 1;
        else if (record.decision === "denied") denials += 1;
        else if (record.decision === "withdrawn") withdrawn += 1;

        const timeline = deriveTimelineDays(record.timelineDays, record.submittedAt, record.decisionAt);
        if (timeline && timeline > 0) timelines.push(timeline);
        if (Number.isFinite(record.confidence)) confidenceValues.push(record.confidence);

        for (const riskFlag of record.riskFlags) {
          riskCounts.set(riskFlag, (riskCounts.get(riskFlag) ?? 0) + 1);
        }

        if (record.decisionAt && (!latestDecisionAt || record.decisionAt > latestDecisionAt)) {
          latestDecisionAt = record.decisionAt;
        }
      }

      const sampleSize = bucket.records.length;
      const approvalRate = round((approvals + approvedWithConditions) / sampleSize);
      const conditionRate = round(approvedWithConditions / sampleSize);
      const denialRate = round(denials / sampleSize);
      const withdrawalRate = round(withdrawn / sampleSize);
      const avgConfidence = confidenceValues.length > 0
        ? round(confidenceValues.reduce((sum, item) => sum + item, 0) / confidenceValues.length)
        : null;
      const timelineP50 = percentile(timelines, 50);
      const timelineP75 = percentile(timelines, 75);
      const timelineP90 = percentile(timelines, 90);

      const topRiskFlags = [...riskCounts.entries()]
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0]);
        })
        .slice(0, 5)
        .map(([riskFlag, count]) => ({
          riskFlag,
          count,
          rate: round(count / sampleSize),
        }));

      return {
        groupKey,
        groupLabel: bucket.groupLabel || groupKey,
        sampleSize,
        approvalRate,
        conditionRate,
        denialRate,
        withdrawalRate,
        timelineSampleSize: timelines.length,
        timelineP50Days: timelineP50,
        timelineP75Days: timelineP75,
        timelineP90Days: timelineP90,
        avgConfidence,
        latestDecisionAt: toDateIso(latestDecisionAt),
        topRiskFlags,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return a.groupKey.localeCompare(b.groupKey);
    });
}

function buildRiskFlagSummary(records: FeaturePrecedentRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const riskFlag of record.riskFlags) {
      counts.set(riskFlag, (counts.get(riskFlag) ?? 0) + 1);
    }
  }
  const denominator = Math.max(1, records.length);
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([riskFlag, count]) => ({
      riskFlag,
      count,
      rate: round(count / denominator),
    }));
}

function buildCalibrationMetrics(records: FeaturePrecedentRecord[]) {
  if (records.length === 0) {
    return {
      sampleSize: 0,
      meanPredictedApproval: null,
      observedApprovalRate: null,
      calibrationGap: null,
      brierScore: null,
    };
  }

  const normalized = records.map((record) => ({
    predicted: Math.min(1, Math.max(0, record.confidence)),
    observed: isApprovalDecision(record.decision) ? 1 : 0,
  }));
  const sampleSize = normalized.length;
  const predictedSum = normalized.reduce((sum, item) => sum + item.predicted, 0);
  const observedSum = normalized.reduce((sum, item) => sum + item.observed, 0);
  const brierSum = normalized.reduce((sum, item) => sum + ((item.predicted - item.observed) ** 2), 0);
  const meanPredictedApproval = predictedSum / sampleSize;
  const observedApprovalRate = observedSum / sampleSize;

  return {
    sampleSize,
    meanPredictedApproval: round(meanPredictedApproval),
    observedApprovalRate: round(observedApprovalRate),
    calibrationGap: round(meanPredictedApproval - observedApprovalRate),
    brierScore: round(brierSum / sampleSize),
  };
}

function buildCalibrationBuckets(records: FeaturePrecedentRecord[]) {
  const buckets = new Map<number, FeaturePrecedentRecord[]>();
  for (const record of records) {
    const predicted = Math.min(1, Math.max(0, record.confidence));
    const bucketIndex = Math.min(9, Math.floor(predicted * 10));
    const current = buckets.get(bucketIndex);
    if (current) current.push(record);
    else buckets.set(bucketIndex, [record]);
  }

  return [...buckets.entries()]
    .map(([bucketIndex, bucketRecords]) => {
      const metrics = buildCalibrationMetrics(bucketRecords);
      return {
        bucket: `${(bucketIndex / 10).toFixed(1)}-${((bucketIndex + 1) / 10).toFixed(1)}`,
        confidenceRangeStart: round(bucketIndex / 10),
        confidenceRangeEnd: round((bucketIndex + 1) / 10),
        ...metrics,
      };
    })
    .sort((a, b) => a.confidenceRangeStart - b.confidenceRangeStart);
}

function buildGroupedCalibrationRows(
  records: FeaturePrecedentRecord[],
  minSampleSize: number,
  groupBy: (record: FeaturePrecedentRecord) => { groupKey: string; groupLabel: string },
) {
  const grouped = new Map<string, { groupLabel: string; records: FeaturePrecedentRecord[] }>();
  for (const record of records) {
    const { groupKey, groupLabel } = groupBy(record);
    const current = grouped.get(groupKey);
    if (current) {
      current.records.push(record);
      if (!current.groupLabel && groupLabel) current.groupLabel = groupLabel;
      continue;
    }
    grouped.set(groupKey, { groupLabel, records: [record] });
  }

  return [...grouped.entries()]
    .map(([groupKey, bucket]) => {
      if (bucket.records.length < minSampleSize) return null;
      return {
        groupKey,
        groupLabel: bucket.groupLabel || groupKey,
        ...buildCalibrationMetrics(bucket.records),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return a.groupKey.localeCompare(b.groupKey);
    });
}

function buildCalibrationSummary(records: FeaturePrecedentRecord[], minSampleSize: number) {
  return {
    overall: buildCalibrationMetrics(records),
    confidenceBuckets: buildCalibrationBuckets(records),
    byStrategy: buildGroupedCalibrationRows(records, minSampleSize, (record) => ({
      groupKey: record.strategyKey,
      groupLabel: record.strategyLabel,
    })),
    byHearingBody: buildGroupedCalibrationRows(records, minSampleSize, (record) => {
      const key = normalizeGroupKey(record.hearingBody, "unknown_hearing_body");
      return { groupKey: key, groupLabel: key };
    }),
  };
}

function buildEntitlementKpiSummary(params: {
  precedents: FeaturePrecedentRecord[];
  snapshots: KpiSnapshotRecord[];
  minSampleSize: number;
}) {
  const snapshotsByStrategy = new Map<string, KpiSnapshotRecord[]>();
  for (const snapshot of params.snapshots) {
    const bucket = snapshotsByStrategy.get(snapshot.strategyKey);
    if (bucket) {
      bucket.push(snapshot);
      continue;
    }
    snapshotsByStrategy.set(snapshot.strategyKey, [snapshot]);
  }

  for (const bucket of snapshotsByStrategy.values()) {
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  const rows = params.precedents.map((precedent) => {
    const strategySnapshots = snapshotsByStrategy.get(precedent.strategyKey) ?? [];
    const anchorAt = precedent.decisionAt ?? precedent.submittedAt ?? new Date();
    let matchedSnapshot: KpiSnapshotRecord | null = null;

    for (const snapshot of strategySnapshots) {
      if (snapshot.createdAt <= anchorAt) {
        matchedSnapshot = snapshot;
        continue;
      }
      break;
    }

    const timelineDays = deriveTimelineDays(
      precedent.timelineDays,
      precedent.submittedAt,
      precedent.decisionAt,
    );
    const timelineErrorDays = matchedSnapshot && timelineDays
      ? Math.abs(matchedSnapshot.expectedDaysP50 - timelineDays)
      : null;

    return {
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: precedent.decision,
      timelineDays,
      approved: isApprovalDecision(precedent.decision) ? 1 : 0,
      anchorAt,
      matchedSnapshot,
      timelineErrorDays,
    };
  });

  function buildMetricSummary(rowsForGroup: typeof rows) {
    const sampleSize = rowsForGroup.length;
    const matched = rowsForGroup.filter((row) => row.matchedSnapshot);
    const timelineValues = rowsForGroup
      .map((row) => row.timelineDays)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const timelineErrors = matched
      .map((row) => row.timelineErrorDays)
      .filter((value): value is number => typeof value === "number");

    const approvalRateOverall = sampleSize === 0
      ? null
      : round(rowsForGroup.reduce((sum, row) => sum + row.approved, 0) / sampleSize);
    const observedApprovalRate = matched.length === 0
      ? null
      : round(matched.reduce((sum, row) => sum + row.approved, 0) / matched.length);

    const meanPredictedApproval = matched.length === 0
      ? null
      : round(
          matched.reduce((sum, row) => sum + Number(row.matchedSnapshot?.probabilityApproval ?? 0), 0)
          / matched.length,
        );
    const approvalCalibrationGap = meanPredictedApproval === null || observedApprovalRate === null
      ? null
      : round(meanPredictedApproval - observedApprovalRate);

    const approvalBrierScore = matched.length === 0
      ? null
      : round(
          matched.reduce((sum, row) => {
            const predicted = Number(row.matchedSnapshot?.probabilityApproval ?? 0);
            return sum + ((predicted - row.approved) ** 2);
          }, 0) / matched.length,
        );

    const approvalDirectionAccuracy = matched.length === 0
      ? null
      : round(
          matched.reduce((sum, row) => {
            const predictedApproved = Number(row.matchedSnapshot?.probabilityApproval ?? 0) >= 0.5 ? 1 : 0;
            return sum + (predictedApproved === row.approved ? 1 : 0);
          }, 0) / matched.length,
        );

    return {
      sampleSize,
      matchedPredictionCount: matched.length,
      predictionMatchRate: sampleSize === 0 ? 0 : round(matched.length / sampleSize),
      approvalRateOverall,
      observedApprovalRate,
      meanPredictedApproval,
      approvalCalibrationGap,
      approvalBrierScore,
      approvalDirectionAccuracy,
      decisionTimelineSampleSize: timelineValues.length,
      medianDecisionDays: percentile(timelineValues, 50),
      timelineErrorSampleSize: timelineErrors.length,
      medianTimelineAbsoluteErrorDays: percentile(timelineErrors, 50),
      meanTimelineAbsoluteErrorDays: timelineErrors.length === 0
        ? null
        : round(timelineErrors.reduce((sum, value) => sum + value, 0) / timelineErrors.length),
    };
  }

  const byStrategy = [...new Set(rows.map((row) => row.strategyKey))]
    .map((strategyKey) => {
      const bucket = rows.filter((row) => row.strategyKey === strategyKey);
      if (bucket.length < params.minSampleSize) return null;
      const strategyLabel = bucket[0]?.strategyLabel ?? strategyKey;
      return {
        strategyKey,
        strategyLabel,
        ...buildMetricSummary(bucket),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return a.strategyKey.localeCompare(b.strategyKey);
    });

  const trendByMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const month = row.anchorAt.toISOString().slice(0, 7);
    const bucket = trendByMonth.get(month);
    if (bucket) {
      bucket.push(row);
      continue;
    }
    trendByMonth.set(month, [row]);
  }

  const trend = [...trendByMonth.entries()]
    .map(([month, monthRows]) => {
      if (monthRows.length < params.minSampleSize) return null;
      const metrics = buildMetricSummary(monthRows);
      return {
        month,
        ...metrics,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    ...buildMetricSummary(rows),
    byStrategy,
    trend,
  };
}

function buildEdgeFeatureRows(edges: FeatureEdgeRecord[], nodeById: Map<string, FeatureNodeRecord>) {
  const grouped = new Map<string, {
    weights: number[];
    strategyKeys: Set<string>;
    nodeTypes: Set<string>;
  }>();

  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    const bucket = grouped.get(edge.edgeType) ?? {
      weights: [],
      strategyKeys: new Set<string>(),
      nodeTypes: new Set<string>(),
    };
    bucket.weights.push(edge.weight);
    if (fromNode?.nodeType) bucket.nodeTypes.add(fromNode.nodeType);
    if (toNode?.nodeType) bucket.nodeTypes.add(toNode.nodeType);
    if (fromNode?.nodeType === "strategy_path") bucket.strategyKeys.add(fromNode.nodeKey);
    if (toNode?.nodeType === "strategy_path") bucket.strategyKeys.add(toNode.nodeKey);
    grouped.set(edge.edgeType, bucket);
  }

  return [...grouped.entries()]
    .map(([edgeType, bucket]) => {
      const sum = bucket.weights.reduce((acc, item) => acc + item, 0);
      return {
        edgeType,
        sampleSize: bucket.weights.length,
        averageWeight: round(sum / bucket.weights.length),
        minWeight: round(Math.min(...bucket.weights)),
        maxWeight: round(Math.max(...bucket.weights)),
        connectedStrategyKeys: [...bucket.strategyKeys].sort((a, b) => a.localeCompare(b)),
        connectedNodeTypes: [...bucket.nodeTypes].sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => {
      if (b.sampleSize !== a.sampleSize) return b.sampleSize - a.sampleSize;
      return a.edgeType.localeCompare(b.edgeType);
    });
}

function buildEntitlementFeaturePrimitives(params: {
  records: FeaturePrecedentRecord[];
  minSampleSize: number;
  edges?: FeatureEdgeRecord[];
  nodes?: FeatureNodeRecord[];
}) {
  const strategyFeatures = buildGroupedFeatureRows(
    params.records,
    params.minSampleSize,
    (record) => ({ groupKey: record.strategyKey, groupLabel: record.strategyLabel }),
  );
  const hearingBodyFeatures = buildGroupedFeatureRows(
    params.records,
    params.minSampleSize,
    (record) => {
      const key = normalizeGroupKey(record.hearingBody, "unknown_hearing_body");
      return { groupKey: key, groupLabel: key };
    },
  );
  const applicationTypeFeatures = buildGroupedFeatureRows(
    params.records,
    params.minSampleSize,
    (record) => {
      const key = normalizeGroupKey(record.applicationType, "unknown_application_type");
      return { groupKey: key, groupLabel: key };
    },
  );
  const riskFlagFeatures = buildRiskFlagSummary(params.records);
  const calibration = buildCalibrationSummary(params.records, params.minSampleSize);

  const nodes = params.nodes ?? [];
  const edges = params.edges ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeFeatures = buildEdgeFeatureRows(edges, nodeById);
  const nodeTypeCounts = new Map<string, number>();
  for (const node of nodes) {
    nodeTypeCounts.set(node.nodeType, (nodeTypeCounts.get(node.nodeType) ?? 0) + 1);
  }

  return {
    totalPrecedents: params.records.length,
    strategyFeatures,
    hearingBodyFeatures,
    applicationTypeFeatures,
    riskFlagFeatures,
    edgeFeatures,
    calibration,
    graphCoverage: {
      strategyNodeCount: nodes.filter((node) => node.nodeType === "strategy_path").length,
      connectedNodeCount: nodes.length,
      connectedEdgeCount: edges.length,
      nodeTypeCounts: Object.fromEntries(
        [...nodeTypeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    },
  };
}

async function getScopeError(
  orgId: string,
  jurisdictionId: string,
  dealId: string | null,
): Promise<Record<string, unknown> | null> {
  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: { id: jurisdictionId, orgId },
    select: { id: true },
  });
  if (!jurisdiction) {
    return {
      error: "Jurisdiction not found or access denied.",
      jurisdictionId,
    };
  }

  if (!dealId) {
    return null;
  }

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId, jurisdictionId },
    select: { id: true },
  });
  if (!deal) {
    return {
      error: "Deal not found or out of scope for this jurisdiction.",
      dealId,
    };
  }

  return null;
}

/**
 * predict_entitlement_path — predicts approval probability and timeline
 * for each available entitlement strategy path in a jurisdiction.
 *
 * This uses persisted precedent outcomes and stores deterministic
 * prediction snapshots so results are auditable and replay-safe.
 */
export const predict_entitlement_path = tool({
  name: "predict_entitlement_path",
  description:
    "Predict probability-of-approval and expected time-to-approval for each entitlement " +
    "strategy path (e.g., by-right, CUP, rezoning, variance) in a jurisdiction. Uses " +
    "historical precedent outcomes and persists prediction snapshots for auditability. " +
    "Use this before choosing an entitlement strategy to compare certainty vs speed.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping."),
    jurisdictionId: z.string().uuid().describe("Jurisdiction to model."),
    dealId: z.string().uuid().nullable().describe("Optional deal scope filter."),
    sku: skuSchema.nullable().describe("Optional SKU filter for strategy relevance."),
    applicationType: z
      .string()
      .nullable()
      .describe("Optional application type filter (e.g., CUP, REZONING, VARIANCE)."),
    lookbackMonths: z
      .number()
      .int()
      .min(1)
      .max(240)
      .nullable()
      .describe("How many months of precedents to include (default 36)."),
    minSampleSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Minimum samples for a strategy path (default 1)."),
    includeBelowMinSample: z
      .boolean()
      .nullable()
      .describe("Whether to include low-sample strategies in output (default true)."),
    persistSnapshot: z
      .boolean()
      .nullable()
      .describe("Whether to persist prediction snapshots (default true)."),
    modelVersion: z
      .string()
      .nullable()
      .describe("Optional model version tag for snapshot lineage."),
  }),
  execute: async ({
    orgId,
    jurisdictionId,
    dealId,
    sku,
    applicationType,
    lookbackMonths,
    minSampleSize,
    includeBelowMinSample,
    persistSnapshot,
    modelVersion,
  }) => {
    const scopeError = await getScopeError(orgId, jurisdictionId, dealId);
    if (scopeError) {
      return JSON.stringify(scopeError);
    }

    const months = Math.max(1, lookbackMonths ?? 36);
    const minSamples = Math.max(1, minSampleSize ?? 1);
    const includeLowSample = includeBelowMinSample ?? true;
    const shouldPersist = persistSnapshot ?? true;
    const version = modelVersion ?? "entitlement_graph_v1";

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const precedents = await prisma.entitlementOutcomePrecedent.findMany({
      where: {
        orgId,
        jurisdictionId,
        ...(dealId ? { dealId } : {}),
        ...(sku ? { sku } : {}),
        ...(applicationType ? { applicationType } : {}),
        decisionAt: { gte: since },
      },
      orderBy: [
        { decisionAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    const inputHash = hashJsonSha256({
      jurisdictionId,
      dealId: dealId ?? null,
      sku: sku ?? null,
      applicationType: applicationType ?? null,
      lookbackMonths: months,
      minSampleSize: minSamples,
      includeBelowMinSample: includeLowSample,
      modelVersion: version,
      precedentFingerprint: precedents.map((precedent) => ({
        id: precedent.id,
        updatedAt: precedent.updatedAt.toISOString(),
      })),
    });

    const predictions = computeEntitlementPathPredictions(
      precedents.map((precedent) => ({
        strategyKey: precedent.strategyKey,
        strategyLabel: precedent.strategyLabel,
        decision: precedent.decision,
        timelineDays: precedent.timelineDays,
        submittedAt: precedent.submittedAt,
        decisionAt: precedent.decisionAt,
        confidence: Number(precedent.confidence),
        riskFlags: precedent.riskFlags,
      })),
      {
        minSampleSize: minSamples,
        includeBelowMinSample: includeLowSample,
        modelVersion: version,
      },
    );

    const snapshotIdByStrategy = new Map<string, string>();
    if (shouldPersist) {
      for (const prediction of predictions) {
        const snapshot = await prisma.entitlementPredictionSnapshot.upsert({
          where: {
            orgId_jurisdictionId_strategyKey_inputHash: {
              orgId,
              jurisdictionId,
              strategyKey: prediction.strategyKey,
              inputHash,
            },
          },
          create: {
            orgId,
            jurisdictionId,
            dealId: dealId ?? null,
            strategyKey: prediction.strategyKey,
            strategyLabel: prediction.strategyLabel,
            sku: sku ?? null,
            probabilityApproval: prediction.probabilityApproval,
            probabilityLow: prediction.probabilityLow,
            probabilityHigh: prediction.probabilityHigh,
            expectedDaysP50: prediction.expectedDaysP50,
            expectedDaysP75: prediction.expectedDaysP75,
            expectedDaysP90: prediction.expectedDaysP90,
            sampleSize: prediction.sampleSize,
            modelVersion: version,
            inputHash,
            rationale: prediction.rationale as object,
          },
          update: {
            dealId: dealId ?? undefined,
            strategyLabel: prediction.strategyLabel,
            sku: sku ?? undefined,
            probabilityApproval: prediction.probabilityApproval,
            probabilityLow: prediction.probabilityLow,
            probabilityHigh: prediction.probabilityHigh,
            expectedDaysP50: prediction.expectedDaysP50,
            expectedDaysP75: prediction.expectedDaysP75,
            expectedDaysP90: prediction.expectedDaysP90,
            sampleSize: prediction.sampleSize,
            modelVersion: version,
            rationale: prediction.rationale as object,
          },
        });
        snapshotIdByStrategy.set(prediction.strategyKey, snapshot.id);
      }
    }

    return JSON.stringify({
      jurisdictionId,
      dealId: dealId ?? null,
      sku: sku ?? null,
      applicationType: applicationType ?? null,
      lookbackMonths: months,
      minSampleSize: minSamples,
      includeBelowMinSample: includeLowSample,
      totalPrecedents: precedents.length,
      strategyCount: predictions.length,
      inputHash,
      modelVersion: version,
      predictions: predictions.map((prediction) => ({
        ...prediction,
        snapshotId: snapshotIdByStrategy.get(prediction.strategyKey) ?? null,
      })),
    });
  },
});

/**
 * get_entitlement_feature_primitives — returns machine-readable precedent features
 * and calibration summaries for strategy-level entitlement planning.
 */
export const get_entitlement_feature_primitives = tool({
  name: "get_entitlement_feature_primitives",
  description:
    "Retrieve entitlement feature primitives from precedent outcomes and graph relationships, " +
    "including strategy/hearing-body rates, timeline distributions, top risk flags, graph coverage, " +
    "and calibration diagnostics for confidence quality checks.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping."),
    jurisdictionId: z.string().uuid().describe("Jurisdiction to analyze."),
    dealId: z.string().uuid().nullable().describe("Optional deal scope filter."),
    sku: skuSchema.nullable().describe("Optional SKU filter for strategy relevance."),
    applicationType: z
      .string()
      .nullable()
      .describe("Optional application type filter (e.g., CUP, REZONING, VARIANCE)."),
    hearingBody: z
      .string()
      .nullable()
      .describe("Optional hearing body filter (e.g., Planning Commission, Metro Council)."),
    strategyKeys: z
      .array(z.string().min(1).max(120))
      .max(200)
      .nullable()
      .describe("Optional strategy-path keys to include."),
    lookbackMonths: z
      .number()
      .int()
      .min(1)
      .max(240)
      .nullable()
      .describe("How many months of precedents to include (default 36)."),
    minSampleSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Minimum records per grouped feature row (default 3)."),
    recordLimit: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .nullable()
      .describe("Max precedent records to process (default 1000)."),
  }),
  execute: async ({
    orgId,
    jurisdictionId,
    dealId,
    sku,
    applicationType,
    hearingBody,
    strategyKeys,
    lookbackMonths,
    minSampleSize,
    recordLimit,
  }) => {
    const scopeError = await getScopeError(orgId, jurisdictionId, dealId);
    if (scopeError) {
      return JSON.stringify(scopeError);
    }

    const months = Math.max(1, lookbackMonths ?? 36);
    const minSamples = Math.max(1, minSampleSize ?? 3);
    const normalizedRecordLimit = Math.max(1, Math.min(5_000, recordLimit ?? 1_000));
    const normalizedStrategyKeys = [...new Set((strategyKeys ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0))];

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const precedents = await prisma.entitlementOutcomePrecedent.findMany({
      where: {
        orgId,
        jurisdictionId,
        ...(dealId ? { dealId } : {}),
        ...(sku ? { sku } : {}),
        ...(applicationType ? { applicationType } : {}),
        ...(hearingBody ? { hearingBody } : {}),
        ...(normalizedStrategyKeys.length > 0 ? { strategyKey: { in: normalizedStrategyKeys } } : {}),
        decisionAt: { gte: since },
      },
      orderBy: [
        { decisionAt: "desc" },
        { createdAt: "desc" },
      ],
      take: normalizedRecordLimit,
      select: {
        strategyKey: true,
        strategyLabel: true,
        decision: true,
        timelineDays: true,
        submittedAt: true,
        decisionAt: true,
        confidence: true,
        riskFlags: true,
        hearingBody: true,
        applicationType: true,
      },
    });

    const records: FeaturePrecedentRecord[] = precedents.map((precedent) => ({
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: decisionSchema.parse(precedent.decision),
      timelineDays: precedent.timelineDays,
      submittedAt: precedent.submittedAt,
      decisionAt: precedent.decisionAt,
      confidence: Number(precedent.confidence),
      riskFlags: precedent.riskFlags,
      hearingBody: precedent.hearingBody,
      applicationType: precedent.applicationType,
    }));

    const strategyKeysFromRecords = [...new Set(records.map((record) => record.strategyKey))];
    const strategyNodes = strategyKeysFromRecords.length === 0
      ? []
      : await prisma.entitlementGraphNode.findMany({
          where: {
            orgId,
            jurisdictionId,
            nodeType: "strategy_path",
            nodeKey: { in: strategyKeysFromRecords },
            active: true,
          },
          select: {
            id: true,
            nodeType: true,
            nodeKey: true,
            label: true,
          },
        });

    const strategyNodeIds = strategyNodes.map((node) => node.id);
    const edges = strategyNodeIds.length === 0
      ? []
      : await prisma.entitlementGraphEdge.findMany({
          where: {
            orgId,
            jurisdictionId,
            OR: [
              { fromNodeId: { in: strategyNodeIds } },
              { toNodeId: { in: strategyNodeIds } },
            ],
          },
          orderBy: [
            { edgeType: "asc" },
            { updatedAt: "desc" },
          ],
          take: Math.min(10_000, normalizedRecordLimit * 5),
          select: {
            edgeType: true,
            weight: true,
            fromNodeId: true,
            toNodeId: true,
          },
        });

    const connectedNodeIds = new Set<string>(strategyNodeIds);
    for (const edge of edges) {
      connectedNodeIds.add(edge.fromNodeId);
      connectedNodeIds.add(edge.toNodeId);
    }

    const connectedNodes: FeatureNodeRecord[] = connectedNodeIds.size === 0
      ? []
      : await prisma.entitlementGraphNode.findMany({
          where: {
            orgId,
            jurisdictionId,
            id: { in: [...connectedNodeIds] },
          },
          select: {
            id: true,
            nodeType: true,
            nodeKey: true,
            label: true,
          },
        });

    const features = buildEntitlementFeaturePrimitives({
      records,
      minSampleSize: minSamples,
      edges: edges.map((edge) => ({
        edgeType: edge.edgeType,
        weight: Number(edge.weight),
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
      })),
      nodes: connectedNodes,
    });

    return JSON.stringify({
      jurisdictionId,
      filters: {
        dealId: dealId ?? null,
        sku: sku ?? null,
        applicationType: applicationType ?? null,
        hearingBody: hearingBody ?? null,
        strategyKeys: normalizedStrategyKeys,
        lookbackMonths: months,
        minSampleSize: minSamples,
        recordLimit: normalizedRecordLimit,
        sinceDate: toDateIso(since),
      },
      ...features,
    });
  },
});

/**
 * get_entitlement_intelligence_kpis — returns forecast quality KPIs for entitlement intelligence.
 * Includes median entitlement decision time, timeline forecast MAE, approval calibration gap,
 * and strategy/month trend breakdowns for ongoing model monitoring.
 */
export const get_entitlement_intelligence_kpis = tool({
  name: "get_entitlement_intelligence_kpis",
  description:
    "Retrieve entitlement forecast-quality KPIs including median decision timeline, timeline " +
    "forecast error (MAE), approval calibration gap, and strategy/month trend diagnostics.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping."),
    jurisdictionId: z.string().uuid().describe("Jurisdiction to analyze."),
    dealId: z.string().uuid().nullable().describe("Optional deal scope filter."),
    sku: skuSchema.nullable().describe("Optional SKU filter."),
    applicationType: z
      .string()
      .nullable()
      .describe("Optional application type filter (e.g., CUP, REZONING, VARIANCE)."),
    hearingBody: z
      .string()
      .nullable()
      .describe("Optional hearing body filter (e.g., Planning Commission, Metro Council)."),
    strategyKeys: z
      .array(z.string().min(1).max(120))
      .max(200)
      .nullable()
      .describe("Optional strategy-path keys to include."),
    lookbackMonths: z
      .number()
      .int()
      .min(1)
      .max(240)
      .nullable()
      .describe("How many months of precedent outcomes to include (default 36)."),
    snapshotLookbackMonths: z
      .number()
      .int()
      .min(1)
      .max(360)
      .nullable()
      .describe("How many months of prediction snapshots to include (default lookback*2)."),
    minSampleSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Minimum records per grouped KPI row (default 1)."),
    recordLimit: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .nullable()
      .describe("Max precedent rows to process (default 1000)."),
  }),
  execute: async ({
    orgId,
    jurisdictionId,
    dealId,
    sku,
    applicationType,
    hearingBody,
    strategyKeys,
    lookbackMonths,
    snapshotLookbackMonths,
    minSampleSize,
    recordLimit,
  }) => {
    const scopeError = await getScopeError(orgId, jurisdictionId, dealId);
    if (scopeError) {
      return JSON.stringify(scopeError);
    }

    const months = Math.max(1, lookbackMonths ?? 36);
    const snapshotMonths = Math.max(months, snapshotLookbackMonths ?? months * 2);
    const minSamples = Math.max(1, minSampleSize ?? 1);
    const normalizedRecordLimit = Math.max(1, Math.min(5_000, recordLimit ?? 1_000));
    const normalizedStrategyKeys = [...new Set((strategyKeys ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0))];

    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const snapshotSince = new Date();
    snapshotSince.setMonth(snapshotSince.getMonth() - snapshotMonths);

    const precedents = await prisma.entitlementOutcomePrecedent.findMany({
      where: {
        orgId,
        jurisdictionId,
        ...(dealId ? { dealId } : {}),
        ...(sku ? { sku } : {}),
        ...(applicationType ? { applicationType } : {}),
        ...(hearingBody ? { hearingBody } : {}),
        ...(normalizedStrategyKeys.length > 0 ? { strategyKey: { in: normalizedStrategyKeys } } : {}),
        decisionAt: { gte: since },
      },
      orderBy: [
        { decisionAt: "desc" },
        { createdAt: "desc" },
      ],
      take: normalizedRecordLimit,
      select: {
        strategyKey: true,
        strategyLabel: true,
        decision: true,
        timelineDays: true,
        submittedAt: true,
        decisionAt: true,
        confidence: true,
        riskFlags: true,
        hearingBody: true,
        applicationType: true,
      },
    });

    const records: FeaturePrecedentRecord[] = precedents.map((precedent) => ({
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: decisionSchema.parse(precedent.decision),
      timelineDays: precedent.timelineDays,
      submittedAt: precedent.submittedAt,
      decisionAt: precedent.decisionAt,
      confidence: Number(precedent.confidence),
      riskFlags: precedent.riskFlags,
      hearingBody: precedent.hearingBody,
      applicationType: precedent.applicationType,
    }));

    const strategyKeysFromRecords = [...new Set(records.map((record) => record.strategyKey))];
    const snapshots = strategyKeysFromRecords.length === 0
      ? []
      : await prisma.entitlementPredictionSnapshot.findMany({
          where: {
            orgId,
            jurisdictionId,
            ...(dealId ? { dealId } : {}),
            ...(sku ? { sku } : {}),
            strategyKey: { in: strategyKeysFromRecords },
            createdAt: { gte: snapshotSince },
          },
          orderBy: [
            { createdAt: "asc" },
          ],
          take: Math.min(10_000, normalizedRecordLimit * 8),
          select: {
            strategyKey: true,
            strategyLabel: true,
            probabilityApproval: true,
            expectedDaysP50: true,
            createdAt: true,
          },
        });

    const summary = buildEntitlementKpiSummary({
      precedents: records,
      snapshots: snapshots.map((snapshot) => ({
        strategyKey: snapshot.strategyKey,
        strategyLabel: snapshot.strategyLabel,
        probabilityApproval: Number(snapshot.probabilityApproval),
        expectedDaysP50: snapshot.expectedDaysP50,
        createdAt: snapshot.createdAt,
      })),
      minSampleSize: minSamples,
    });

    return JSON.stringify({
      jurisdictionId,
      filters: {
        dealId: dealId ?? null,
        sku: sku ?? null,
        applicationType: applicationType ?? null,
        hearingBody: hearingBody ?? null,
        strategyKeys: normalizedStrategyKeys,
        lookbackMonths: months,
        snapshotLookbackMonths: snapshotMonths,
        minSampleSize: minSamples,
        recordLimit: normalizedRecordLimit,
        sinceDate: toDateIso(since),
        snapshotSinceDate: toDateIso(snapshotSince),
      },
      ...summary,
    });
  },
});
