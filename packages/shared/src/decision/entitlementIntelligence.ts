export type EntitlementDecision =
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "withdrawn"
  | "unknown";

export interface EntitlementPrecedentObservation {
  strategyKey: string;
  strategyLabel: string;
  decision: string;
  timelineDays?: number | null;
  submittedAt?: Date | string | null;
  decisionAt?: Date | string | null;
  confidence?: number | null;
  riskFlags?: string[] | null;
}

export interface EntitlementPredictionOptions {
  minSampleSize?: number;
  includeBelowMinSample?: boolean;
  priorAlpha?: number;
  priorBeta?: number;
  confidenceZ?: number;
  modelVersion?: string;
}

export interface EntitlementStrategyPrediction {
  strategyKey: string;
  strategyLabel: string;
  probabilityApproval: number;
  probabilityLow: number;
  probabilityHigh: number;
  expectedDaysP50: number;
  expectedDaysP75: number;
  expectedDaysP90: number;
  sampleSize: number;
  approvalCount: number;
  conditionalApprovalCount: number;
  timelineSampleSize: number;
  confidenceScore: number;
  modelVersion: string;
  rationale: {
    minSampleSize: number;
    approvalRateRaw: number;
    priorAlpha: number;
    priorBeta: number;
    frictionRatio: number;
    timelineCoverage: number;
  };
}

type StrategyAggregate = {
  strategyKey: string;
  strategyLabel: string;
  records: EntitlementPrecedentObservation[];
};

const APPROVAL_DECISIONS = new Set<EntitlementDecision>([
  "approved",
  "approved_with_conditions",
]);

const CONDITIONAL_APPROVAL = "approved_with_conditions";
const FRICTION_FLAGS = new Set([
  "public_opposition",
  "traffic_impact",
  "drainage_constraint",
  "variance_required",
  "rezoning_required",
  "environmental_constraint",
]);

function normalizeDecision(value: string): EntitlementDecision {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "approved_with_conditions") return "approved_with_conditions";
  if (normalized === "denied") return "denied";
  if (normalized === "withdrawn") return "withdrawn";
  return "unknown";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function deriveTimelineDays(record: EntitlementPrecedentObservation): number | null {
  if (typeof record.timelineDays === "number" && Number.isFinite(record.timelineDays) && record.timelineDays > 0) {
    return Math.round(record.timelineDays);
  }

  const submittedAt = toDate(record.submittedAt);
  const decisionAt = toDate(record.decisionAt);
  if (!submittedAt || !decisionAt) return null;

  const ms = decisionAt.getTime() - submittedAt.getTime();
  if (ms <= 0) return null;
  return Math.round(ms / 86_400_000);
}

function wilsonInterval(approvals: number, sampleSize: number, z: number): [number, number] {
  if (sampleSize <= 0) return [0, 1];

  const pHat = approvals / sampleSize;
  const z2 = z ** 2;
  const denominator = 1 + z2 / sampleSize;
  const center = pHat + z2 / (2 * sampleSize);
  const marginNumerator =
    pHat * (1 - pHat) / sampleSize +
    z2 / (4 * sampleSize * sampleSize);
  const margin = z * Math.sqrt(marginNumerator);

  const low = (center - margin) / denominator;
  const high = (center + margin) / denominator;
  return [clamp(low, 0, 1), clamp(high, 0, 1)];
}

function frictionRatio(records: EntitlementPrecedentObservation[]): number {
  if (records.length === 0) return 0;
  const withFriction = records.filter((record) =>
    (record.riskFlags ?? []).some((flag) => FRICTION_FLAGS.has(flag)),
  ).length;
  return withFriction / records.length;
}

function computeConfidenceScore(
  sampleSize: number,
  timelineSampleSize: number,
  records: EntitlementPrecedentObservation[],
): number {
  const sampleStrength = clamp(sampleSize / 12, 0, 1);
  const timelineCoverage = sampleSize === 0 ? 0 : timelineSampleSize / sampleSize;

  const confidenceValues = records
    .map((record) => record.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => clamp(value, 0, 1));
  const averageInputConfidence =
    confidenceValues.length === 0
      ? 0.7
      : confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;

  return round(
    clamp(sampleStrength * 0.5 + averageInputConfidence * 0.3 + timelineCoverage * 0.2, 0, 1),
    4,
  );
}

function groupByStrategy(
  observations: EntitlementPrecedentObservation[],
): Map<string, StrategyAggregate> {
  const grouped = new Map<string, StrategyAggregate>();
  for (const observation of observations) {
    const key = observation.strategyKey.trim();
    const label = observation.strategyLabel.trim() || key;
    if (!key) continue;

    const current = grouped.get(key);
    if (current) {
      current.records.push(observation);
      if (!current.strategyLabel && label) {
        current.strategyLabel = label;
      }
      continue;
    }

    grouped.set(key, {
      strategyKey: key,
      strategyLabel: label,
      records: [observation],
    });
  }

  return grouped;
}

export function computeEntitlementPathPredictions(
  observations: EntitlementPrecedentObservation[],
  options: EntitlementPredictionOptions = {},
): EntitlementStrategyPrediction[] {
  const minSampleSize = Math.max(1, options.minSampleSize ?? 1);
  const includeBelowMinSample = options.includeBelowMinSample ?? true;
  const priorAlpha = options.priorAlpha ?? 1;
  const priorBeta = options.priorBeta ?? 1;
  const confidenceZ = options.confidenceZ ?? 1.96;
  const modelVersion = options.modelVersion ?? "entitlement_graph_v1";

  const grouped = groupByStrategy(observations);
  const predictions: EntitlementStrategyPrediction[] = [];

  for (const aggregate of grouped.values()) {
    const sampleSize = aggregate.records.length;
    if (!includeBelowMinSample && sampleSize < minSampleSize) {
      continue;
    }

    const approvals = aggregate.records.filter((record) =>
      APPROVAL_DECISIONS.has(normalizeDecision(record.decision)),
    );
    const conditionalApprovals = aggregate.records.filter(
      (record) => normalizeDecision(record.decision) === CONDITIONAL_APPROVAL,
    );
    const approvalCount = approvals.length;
    const conditionalApprovalCount = conditionalApprovals.length;

    const approvalRateRaw = sampleSize === 0 ? 0 : approvalCount / sampleSize;
    const probabilityApproval = (approvalCount + priorAlpha) / (sampleSize + priorAlpha + priorBeta);
    const [intervalLow, intervalHigh] = wilsonInterval(approvalCount, sampleSize, confidenceZ);

    const timelineValues = aggregate.records
      .map(deriveTimelineDays)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.max(1, value));
    const timelineSampleSize = timelineValues.length;

    const p50Base = timelineSampleSize > 0 ? quantile(timelineValues, 0.5) : 180;
    const p75Base = timelineSampleSize > 0 ? quantile(timelineValues, 0.75) : 240;
    const p90Base = timelineSampleSize > 0 ? quantile(timelineValues, 0.9) : 300;
    const friction = frictionRatio(aggregate.records);
    const timelineMultiplier = 1 + friction * 0.25;

    const expectedDaysP50 = Math.max(1, Math.round(p50Base * timelineMultiplier));
    const expectedDaysP75 = Math.max(expectedDaysP50, Math.round(p75Base * timelineMultiplier));
    const expectedDaysP90 = Math.max(expectedDaysP75, Math.round(p90Base * timelineMultiplier));

    const timelineCoverage = sampleSize === 0 ? 0 : timelineSampleSize / sampleSize;

    predictions.push({
      strategyKey: aggregate.strategyKey,
      strategyLabel: aggregate.strategyLabel,
      probabilityApproval: round(clamp(probabilityApproval, 0, 1), 5),
      probabilityLow: round(intervalLow, 5),
      probabilityHigh: round(intervalHigh, 5),
      expectedDaysP50,
      expectedDaysP75,
      expectedDaysP90,
      sampleSize,
      approvalCount,
      conditionalApprovalCount,
      timelineSampleSize,
      confidenceScore: computeConfidenceScore(sampleSize, timelineSampleSize, aggregate.records),
      modelVersion,
      rationale: {
        minSampleSize,
        approvalRateRaw: round(approvalRateRaw, 5),
        priorAlpha,
        priorBeta,
        frictionRatio: round(friction, 5),
        timelineCoverage: round(timelineCoverage, 5),
      },
    });
  }

  return predictions.sort((a, b) => {
    if (b.probabilityApproval !== a.probabilityApproval) {
      return b.probabilityApproval - a.probabilityApproval;
    }
    if (a.expectedDaysP50 !== b.expectedDaysP50) {
      return a.expectedDaysP50 - b.expectedDaysP50;
    }
    return b.sampleSize - a.sampleSize;
  });
}
