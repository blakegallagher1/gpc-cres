import { prisma } from "@entitlement-os/db";
import {
  computeEntitlementPathPredictions,
  hashJsonSha256,
  type EntitlementStrategyPrediction,
} from "@entitlement-os/shared";

type SkuType = "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";

type DecisionType =
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "withdrawn";

export interface UpsertEntitlementGraphNodeInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  nodeType: string;
  nodeKey: string;
  label: string;
  attributes?: Record<string, unknown>;
  confidence?: number | null;
  active?: boolean | null;
}

export interface UpsertEntitlementGraphEdgeInput {
  orgId: string;
  jurisdictionId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  weight?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpsertEntitlementOutcomePrecedentInput {
  orgId: string;
  jurisdictionId: string;
  precedentKey: string;
  strategyKey: string;
  strategyLabel: string;
  decision: DecisionType;
  dealId?: string | null;
  strategyNodeId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  hearingBody?: string | null;
  submittedAt?: string | null;
  decisionAt?: string | null;
  timelineDays?: number | null;
  conditions?: unknown[];
  riskFlags?: string[];
  sourceEvidenceIds?: string[];
  sourceSnapshotIds?: string[];
  confidence?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface PredictEntitlementStrategiesInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  lookbackMonths?: number | null;
  minSampleSize?: number | null;
  includeBelowMinSample?: boolean | null;
  persistSnapshots?: boolean | null;
  modelVersion?: string | null;
}

export interface EntitlementGraphReadInput {
  orgId: string;
  jurisdictionId: string;
  nodeTypes?: string[] | null;
  includeInactive?: boolean | null;
  limit?: number | null;
}

export interface EntitlementFeatureQueryInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  hearingBody?: string | null;
  strategyKeys?: string[] | null;
  lookbackMonths?: number | null;
  minSampleSize?: number | null;
  recordLimit?: number | null;
}

export interface EntitlementKpiQueryInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  hearingBody?: string | null;
  strategyKeys?: string[] | null;
  lookbackMonths?: number | null;
  snapshotLookbackMonths?: number | null;
  minSampleSize?: number | null;
  recordLimit?: number | null;
}

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

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function deriveTimelineDays(
  timelineDays: number | null | undefined,
  submittedAt: Date | null,
  decisionAt: Date | null,
): number | null {
  if (typeof timelineDays === "number" && Number.isFinite(timelineDays) && timelineDays > 0) {
    return Math.round(timelineDays);
  }
  if (!submittedAt || !decisionAt) {
    return null;
  }
  const diffMs = decisionAt.getTime() - submittedAt.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 86_400_000);
}

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

function normalizeGroupKey(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return text && text.length > 0 ? text : fallback;
}

function toDateIso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
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

  const rows = [...grouped.entries()]
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

  return rows;
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

function isApprovalDecision(decision: DecisionType): boolean {
  return decision === "approved" || decision === "approved_with_conditions";
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
  const brierSum = normalized.reduce(
    (sum, item) => sum + ((item.predicted - item.observed) ** 2),
    0,
  );
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
    if (current) {
      current.push(record);
      continue;
    }
    buckets.set(bucketIndex, [record]);
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

    const brierScore = matched.length === 0
      ? null
      : round(
          matched.reduce((sum, row) => {
            const predicted = Number(row.matchedSnapshot?.probabilityApproval ?? 0);
            return sum + ((predicted - row.approved) ** 2);
          }, 0) / matched.length,
        );

    const directionAccuracy = matched.length === 0
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
      approvalBrierScore: brierScore,
      approvalDirectionAccuracy: directionAccuracy,
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

  return {
    ...buildMetricSummary(rows),
    byStrategy,
  };
}

function buildEdgeFeatureRows(
  edges: FeatureEdgeRecord[],
  nodeById: Map<string, FeatureNodeRecord>,
) {
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
    (record) => ({
      groupKey: record.strategyKey,
      groupLabel: record.strategyLabel,
    }),
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

  const nodes = params.nodes ?? [];
  const edges = params.edges ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeFeatures = buildEdgeFeatureRows(edges, nodeById);
  const calibration = buildCalibrationSummary(params.records, params.minSampleSize);
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

async function assertJurisdictionScope(orgId: string, jurisdictionId: string): Promise<void> {
  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: { id: jurisdictionId, orgId },
    select: { id: true },
  });
  if (!jurisdiction) {
    throw new Error("Jurisdiction not found or access denied.");
  }
}

async function assertDealScope(
  orgId: string,
  dealId: string | null | undefined,
  jurisdictionId?: string,
): Promise<void> {
  if (!dealId) return;
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { jurisdictionId: true },
  });
  if (!deal) {
    throw new Error("Deal not found or access denied.");
  }
  if (jurisdictionId && deal.jurisdictionId !== jurisdictionId) {
    throw new Error("Deal does not belong to the provided jurisdiction.");
  }
}

export async function upsertEntitlementGraphNode(
  input: UpsertEntitlementGraphNodeInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const node = await prisma.entitlementGraphNode.upsert({
    where: {
      orgId_jurisdictionId_nodeType_nodeKey: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        nodeType: input.nodeType,
        nodeKey: input.nodeKey,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      dealId: input.dealId ?? null,
      nodeType: input.nodeType,
      nodeKey: input.nodeKey,
      label: input.label,
      attributes: (input.attributes ?? {}) as object,
      confidence: input.confidence ?? 0.7,
      active: input.active ?? true,
    },
    update: {
      dealId: input.dealId ?? undefined,
      label: input.label,
      attributes: (input.attributes ?? {}) as object,
      confidence: input.confidence ?? undefined,
      active: input.active ?? undefined,
    },
  });

  return {
    id: node.id,
    nodeType: node.nodeType,
    nodeKey: node.nodeKey,
    label: node.label,
    confidence: Number(node.confidence),
    active: node.active,
  };
}

export async function upsertEntitlementGraphEdge(
  input: UpsertEntitlementGraphEdgeInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);

  const connectedNodes = await prisma.entitlementGraphNode.findMany({
    where: {
      id: { in: [input.fromNodeId, input.toNodeId] },
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
    },
    select: { id: true },
  });
  if (connectedNodes.length !== 2) {
    throw new Error("Both edge nodes must exist in the same org and jurisdiction.");
  }

  const edge = await prisma.entitlementGraphEdge.upsert({
    where: {
      orgId_jurisdictionId_fromNodeId_toNodeId_edgeType: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        edgeType: input.edgeType,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      edgeType: input.edgeType,
      weight: input.weight ?? 1,
      metadata: (input.metadata ?? {}) as object,
    },
    update: {
      weight: input.weight ?? undefined,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  return {
    id: edge.id,
    edgeType: edge.edgeType,
    weight: Number(edge.weight),
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
  };
}

export async function upsertEntitlementOutcomePrecedent(
  input: UpsertEntitlementOutcomePrecedentInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  let strategyNodeId = input.strategyNodeId ?? null;
  if (!strategyNodeId) {
    const strategyNode = await prisma.entitlementGraphNode.upsert({
      where: {
        orgId_jurisdictionId_nodeType_nodeKey: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          nodeType: "strategy_path",
          nodeKey: input.strategyKey,
        },
      },
      create: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        dealId: input.dealId ?? null,
        nodeType: "strategy_path",
        nodeKey: input.strategyKey,
        label: input.strategyLabel,
        attributes: {} as object,
        confidence: input.confidence ?? 0.7,
        active: true,
      },
      update: {
        label: input.strategyLabel,
        confidence: input.confidence ?? undefined,
      },
      select: { id: true },
    });
    strategyNodeId = strategyNode.id;
  }

  const submittedAt = parseDate(input.submittedAt);
  const decisionAt = parseDate(input.decisionAt);
  const timelineDays = deriveTimelineDays(input.timelineDays, submittedAt, decisionAt);

  const precedent = await prisma.entitlementOutcomePrecedent.upsert({
    where: {
      orgId_jurisdictionId_precedentKey: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        precedentKey: input.precedentKey,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      dealId: input.dealId ?? null,
      strategyNodeId,
      precedentKey: input.precedentKey,
      strategyKey: input.strategyKey,
      strategyLabel: input.strategyLabel,
      sku: input.sku ?? null,
      applicationType: input.applicationType ?? null,
      hearingBody: input.hearingBody ?? null,
      submittedAt,
      decisionAt,
      decision: input.decision,
      timelineDays,
      conditions: (input.conditions ?? []) as object,
      riskFlags: input.riskFlags ?? [],
      sourceEvidenceIds: input.sourceEvidenceIds ?? [],
      sourceSnapshotIds: input.sourceSnapshotIds ?? [],
      confidence: input.confidence ?? 0.7,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
    },
    update: {
      dealId: input.dealId ?? undefined,
      strategyNodeId,
      strategyKey: input.strategyKey,
      strategyLabel: input.strategyLabel,
      sku: input.sku ?? undefined,
      applicationType: input.applicationType ?? undefined,
      hearingBody: input.hearingBody ?? undefined,
      submittedAt: submittedAt ?? undefined,
      decisionAt: decisionAt ?? undefined,
      decision: input.decision,
      timelineDays: timelineDays ?? undefined,
      conditions: (input.conditions ?? []) as object,
      riskFlags: input.riskFlags ?? [],
      sourceEvidenceIds: input.sourceEvidenceIds ?? [],
      sourceSnapshotIds: input.sourceSnapshotIds ?? [],
      confidence: input.confidence ?? undefined,
      notes: input.notes ?? undefined,
      createdBy: input.createdBy ?? undefined,
    },
  });

  return {
    id: precedent.id,
    precedentKey: precedent.precedentKey,
    strategyKey: precedent.strategyKey,
    strategyLabel: precedent.strategyLabel,
    decision: precedent.decision,
    timelineDays: precedent.timelineDays,
    confidence: Number(precedent.confidence),
  };
}

export async function predictEntitlementStrategies(
  input: PredictEntitlementStrategiesInput,
): Promise<{
  modelVersion: string;
  jurisdictionId: string;
  totalPrecedents: number;
  strategyCount: number;
  inputHash: string;
  predictions: Array<EntitlementStrategyPrediction & { snapshotId: string | null }>;
}> {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const lookbackMonths = Math.max(1, input.lookbackMonths ?? 36);
  const minSampleSize = Math.max(1, input.minSampleSize ?? 1);
  const includeBelowMinSample = input.includeBelowMinSample ?? true;
  const persistSnapshots = input.persistSnapshots ?? true;
  const modelVersion = input.modelVersion ?? "entitlement_graph_v1";

  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(input.dealId ? { dealId: input.dealId } : {}),
      ...(input.sku ? { sku: input.sku } : {}),
      ...(input.applicationType ? { applicationType: input.applicationType } : {}),
      decisionAt: { gte: since },
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const inputHash = hashJsonSha256({
    jurisdictionId: input.jurisdictionId,
    dealId: input.dealId ?? null,
    sku: input.sku ?? null,
    applicationType: input.applicationType ?? null,
    lookbackMonths,
    minSampleSize,
    includeBelowMinSample,
    modelVersion,
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
      minSampleSize,
      includeBelowMinSample,
      modelVersion,
    },
  );

  const snapshotIdByStrategy = new Map<string, string>();
  if (persistSnapshots) {
    for (const prediction of predictions) {
      const snapshot = await prisma.entitlementPredictionSnapshot.upsert({
        where: {
          orgId_jurisdictionId_strategyKey_inputHash: {
            orgId: input.orgId,
            jurisdictionId: input.jurisdictionId,
            strategyKey: prediction.strategyKey,
            inputHash,
          },
        },
        create: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          dealId: input.dealId ?? null,
          strategyKey: prediction.strategyKey,
          strategyLabel: prediction.strategyLabel,
          sku: input.sku ?? null,
          probabilityApproval: prediction.probabilityApproval,
          probabilityLow: prediction.probabilityLow,
          probabilityHigh: prediction.probabilityHigh,
          expectedDaysP50: prediction.expectedDaysP50,
          expectedDaysP75: prediction.expectedDaysP75,
          expectedDaysP90: prediction.expectedDaysP90,
          sampleSize: prediction.sampleSize,
          modelVersion,
          inputHash,
          rationale: prediction.rationale as object,
        },
        update: {
          dealId: input.dealId ?? undefined,
          strategyLabel: prediction.strategyLabel,
          sku: input.sku ?? undefined,
          probabilityApproval: prediction.probabilityApproval,
          probabilityLow: prediction.probabilityLow,
          probabilityHigh: prediction.probabilityHigh,
          expectedDaysP50: prediction.expectedDaysP50,
          expectedDaysP75: prediction.expectedDaysP75,
          expectedDaysP90: prediction.expectedDaysP90,
          sampleSize: prediction.sampleSize,
          modelVersion,
          rationale: prediction.rationale as object,
        },
      });

      snapshotIdByStrategy.set(prediction.strategyKey, snapshot.id);
    }
  }

  return {
    modelVersion,
    jurisdictionId: input.jurisdictionId,
    totalPrecedents: precedents.length,
    strategyCount: predictions.length,
    inputHash,
    predictions: predictions.map((prediction) => ({
      ...prediction,
      snapshotId: snapshotIdByStrategy.get(prediction.strategyKey) ?? null,
    })),
  };
}

export async function getEntitlementFeaturePrimitives(input: EntitlementFeatureQueryInput) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const lookbackMonths = Math.max(1, input.lookbackMonths ?? 36);
  const minSampleSize = Math.max(1, input.minSampleSize ?? 3);
  const recordLimit = Math.max(1, Math.min(5_000, input.recordLimit ?? 1_000));
  const strategyKeys = [...new Set((input.strategyKeys ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0))];

  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(input.dealId ? { dealId: input.dealId } : {}),
      ...(input.sku ? { sku: input.sku } : {}),
      ...(input.applicationType ? { applicationType: input.applicationType } : {}),
      ...(input.hearingBody ? { hearingBody: input.hearingBody } : {}),
      ...(strategyKeys.length > 0 ? { strategyKey: { in: strategyKeys } } : {}),
      decisionAt: { gte: since },
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
    take: recordLimit,
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
    decision: precedent.decision as DecisionType,
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
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
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
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          OR: [
            { fromNodeId: { in: strategyNodeIds } },
            { toNodeId: { in: strategyNodeIds } },
          ],
        },
        orderBy: [
          { edgeType: "asc" },
          { updatedAt: "desc" },
        ],
        take: Math.min(10_000, recordLimit * 5),
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

  const connectedNodes = connectedNodeIds.size === 0
    ? []
    : await prisma.entitlementGraphNode.findMany({
        where: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
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
    minSampleSize,
    edges: edges.map((edge) => ({
      edgeType: edge.edgeType,
      weight: Number(edge.weight),
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    })),
    nodes: connectedNodes,
  });

  return {
    jurisdictionId: input.jurisdictionId,
    filters: {
      dealId: input.dealId ?? null,
      sku: input.sku ?? null,
      applicationType: input.applicationType ?? null,
      hearingBody: input.hearingBody ?? null,
      strategyKeys,
      lookbackMonths,
      minSampleSize,
      recordLimit,
      sinceDate: toDateIso(since),
    },
    ...features,
  };
}

export async function getEntitlementIntelligenceKpis(input: EntitlementKpiQueryInput) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const lookbackMonths = Math.max(1, input.lookbackMonths ?? 36);
  const snapshotLookbackMonths = Math.max(
    lookbackMonths,
    input.snapshotLookbackMonths ?? lookbackMonths * 2,
  );
  const minSampleSize = Math.max(1, input.minSampleSize ?? 1);
  const recordLimit = Math.max(1, Math.min(5_000, input.recordLimit ?? 1_000));
  const strategyKeys = [...new Set((input.strategyKeys ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0))];

  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);
  const snapshotSince = new Date();
  snapshotSince.setMonth(snapshotSince.getMonth() - snapshotLookbackMonths);

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(input.dealId ? { dealId: input.dealId } : {}),
      ...(input.sku ? { sku: input.sku } : {}),
      ...(input.applicationType ? { applicationType: input.applicationType } : {}),
      ...(input.hearingBody ? { hearingBody: input.hearingBody } : {}),
      ...(strategyKeys.length > 0 ? { strategyKey: { in: strategyKeys } } : {}),
      decisionAt: { gte: since },
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
    take: recordLimit,
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
    decision: precedent.decision as DecisionType,
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
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          ...(input.dealId ? { dealId: input.dealId } : {}),
          ...(input.sku ? { sku: input.sku } : {}),
          strategyKey: { in: strategyKeysFromRecords },
          createdAt: { gte: snapshotSince },
        },
        orderBy: [
          { createdAt: "asc" },
        ],
        take: Math.min(10_000, recordLimit * 8),
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
    minSampleSize,
  });

  return {
    jurisdictionId: input.jurisdictionId,
    filters: {
      dealId: input.dealId ?? null,
      sku: input.sku ?? null,
      applicationType: input.applicationType ?? null,
      hearingBody: input.hearingBody ?? null,
      strategyKeys,
      lookbackMonths,
      snapshotLookbackMonths,
      minSampleSize,
      recordLimit,
      sinceDate: toDateIso(since),
      snapshotSinceDate: toDateIso(snapshotSince),
    },
    ...summary,
  };
}

export async function getEntitlementGraph(input: EntitlementGraphReadInput) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);

  const limit = Math.max(1, Math.min(500, input.limit ?? 250));
  const includeInactive = input.includeInactive ?? false;

  const nodes = await prisma.entitlementGraphNode.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(includeInactive ? {} : { active: true }),
      ...(input.nodeTypes && input.nodeTypes.length > 0
        ? { nodeType: { in: input.nodeTypes } }
        : {}),
    },
    orderBy: [
      { nodeType: "asc" },
      { nodeKey: "asc" },
    ],
    take: limit,
  });

  const nodeIds = nodes.map((node) => node.id);
  const edges = nodeIds.length === 0
    ? []
    : await prisma.entitlementGraphEdge.findMany({
        where: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          OR: [
            { fromNodeId: { in: nodeIds } },
            { toNodeId: { in: nodeIds } },
          ],
        },
        orderBy: [
          { edgeType: "asc" },
          { createdAt: "desc" },
        ],
      });

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 200,
  });

  return {
    jurisdictionId: input.jurisdictionId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    precedentCount: precedents.length,
    nodes: nodes.map((node) => ({
      id: node.id,
      nodeType: node.nodeType,
      nodeKey: node.nodeKey,
      label: node.label,
      attributes: node.attributes as Record<string, unknown>,
      confidence: Number(node.confidence),
      active: node.active,
      dealId: node.dealId,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeType: edge.edgeType,
      weight: Number(edge.weight),
      metadata: edge.metadata as Record<string, unknown>,
      createdAt: edge.createdAt.toISOString(),
      updatedAt: edge.updatedAt.toISOString(),
    })),
    precedents: precedents.map((precedent) => ({
      id: precedent.id,
      precedentKey: precedent.precedentKey,
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: precedent.decision,
      timelineDays: precedent.timelineDays,
      decisionAt: precedent.decisionAt ? precedent.decisionAt.toISOString().slice(0, 10) : null,
      confidence: Number(precedent.confidence),
      riskFlags: precedent.riskFlags,
    })),
  };
}

export const __testables = {
  buildEntitlementFeaturePrimitives,
  buildCalibrationSummary,
  buildEntitlementKpiSummary,
  deriveTimelineDays,
};
