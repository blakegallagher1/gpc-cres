import "server-only";

import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";

type NumericValue = number;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CALIBRATION_MINIMUMS = {
  MIN_N: 5,
  VARIANCE_CEILING: 0.25,
  CONFIDENCE_FLOOR: 0.6,
  BAND_WIDENING_PENALTY: 0.15,
} as const;

const HALF_LIFE_DAYS: Record<string, number> = {
  stable: 730,
  cyclical: 365,
  high_volatility: 180,
};

function computeEffectiveWeight(baseWeight: number, ageInDays: number, volatilityClass: string): number {
  const halfLife = HALF_LIFE_DAYS[volatilityClass] ?? 365;
  const decay = Math.exp((-Math.LN2 * Math.max(ageInDays, 0)) / halfLife);
  return Math.max(0, baseWeight * decay);
}

export type CalibrationDelta = Array<{
  metricKey: string;
  bias: number;
  confidence: number;
  sampleN: number;
}>;

export type CalibrationSegmentDescriptor = {
  orgId: string;
  propertyType: string;
  market: string;
  strategy: string;
  leverageBand: string;
  vintageYear: number;
};

interface SegmentStats {
  segmentId: string;
  sampleN: number;
  variance: number | null;
  mae: number | null;
  noiBias: number | null;
  rehabBias: number | null;
  exitCapBias: number | null;
  leaseUpBias: number | null;
}

type NumericJson = Record<string, unknown>;

function asNumber(value: unknown): NumericValue | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeConfidence(sampleN: number, variance: number | null): number {
  const normalized = clamp(sampleN / (CALIBRATION_MINIMUMS.MIN_N * 2), 0, 1);
  let confidence =
    CALIBRATION_MINIMUMS.CONFIDENCE_FLOOR +
    (1 - CALIBRATION_MINIMUMS.CONFIDENCE_FLOOR) * normalized;

  if (variance !== null && variance > CALIBRATION_MINIMUMS.VARIANCE_CEILING) {
    confidence -= CALIBRATION_MINIMUMS.BAND_WIDENING_PENALTY;
  }

  return clamp(confidence, 0, 1);
}

function volatilityForMetric(metricKey: string): "stable" | "cyclical" | "high_volatility" {
  if (metricKey.includes("cap")) return "high_volatility";
  if (metricKey.includes("rehab")) return "cyclical";
  return "stable";
}

function parseJsonObject(value: unknown): NumericJson {
  return typeof value === "object" && value !== null ? (value as NumericJson) : {};
}

function buildMetricFromProjectionProjectionPayload(payload: NumericJson): Record<string, number> {
  const metricKey = typeof payload.metric_key === "string" ? payload.metric_key.trim() : "";
  const projectedValue = asNumber(payload.projected_value);
  if (metricKey.length > 0 && projectedValue !== null) {
    return { [metricKey]: projectedValue };
  }
  return {};
}

async function loadOrCreateSegment(
  descriptor: CalibrationSegmentDescriptor,
): Promise<{ id: string }> {
  const existing = await prisma.calibrationSegment.findFirst({
    where: {
      orgId: descriptor.orgId,
      propertyType: descriptor.propertyType,
      market: descriptor.market,
      strategy: descriptor.strategy,
      leverageBand: descriptor.leverageBand,
      vintageYear: descriptor.vintageYear,
    },
    select: { id: true },
  });

  if (existing) return { id: existing.id };

  const created = await prisma.calibrationSegment.create({
    data: descriptor,
    select: { id: true },
  });
  return { id: created.id };
}

function combineProjectionSnapshots(
  projectionSnapshot: unknown,
  records: Array<{ payloadJson: Prisma.JsonValue }>,
): Record<string, number> {
  const merged: Record<string, unknown> = {};

  for (const record of records) {
    const payload = parseJsonObject(record.payloadJson);
    const metric = buildMetricFromProjectionProjectionPayload(payload);
    for (const [metricKey, projectedValue] of Object.entries(metric)) {
      if (!(metricKey in merged)) merged[metricKey] = projectedValue;
    }
  }

  for (const [metricKey, value] of Object.entries(parseJsonObject(projectionSnapshot))) {
    const numericValue = asNumber(value);
    if (numericValue !== null) merged[metricKey] = numericValue;
  }

  return Object.fromEntries(
    Object.entries(merged)
      .map(([key, value]) => [key, asNumber(value)])
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [key, value as number]),
  );
}

function combineFinalMetrics(finalMetrics: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(parseJsonObject(finalMetrics))
      .map(([key, value]) => [key, asNumber(value)])
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [key, value as number]),
  );
}

function weightedMean(values: Array<{ value: number; weight: number }>): number {
  let numerator = 0;
  let denominator = 0;
  for (const entry of values) {
    const weight = Number.isFinite(entry.weight) ? entry.weight : 0;
    numerator += entry.value * weight;
    denominator += weight;
  }
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function ageInDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY));
}

async function upsertSegmentStats(orgId: string, segmentId: string): Promise<SegmentStats> {
  const now = new Date();
  const records = await prisma.calibrationRecord.findMany({
    where: { orgId, segmentId },
    select: {
      metricKey: true,
      delta: true,
      effectiveWeight: true,
      volatilityClass: true,
      createdAt: true,
    },
  });

  if (records.length === 0) {
    const empty: SegmentStats = {
      segmentId,
      sampleN: 0,
      variance: null,
      mae: null,
      noiBias: null,
      rehabBias: null,
      exitCapBias: null,
      leaseUpBias: null,
    };

    await prisma.calibrationSegment.updateMany({
      where: { id: segmentId, orgId },
      data: {
        sampleN: 0,
        variance: null,
        mae: null,
        noiBias: null,
        rehabBias: null,
        exitCapBias: null,
        leaseUpBias: null,
        lastUpdated: new Date(),
      },
    });
    return empty;
  }

  const byKey: Record<string, Array<{ value: number; weight: number }>> = {};
  const all: Array<{ value: number; weight: number }> = [];
  for (const record of records) {
    const bucket = byKey[record.metricKey] ?? [];
    const decayedWeight = computeEffectiveWeight(
      record.effectiveWeight,
      ageInDays(record.createdAt, now),
      record.volatilityClass,
    );
    bucket.push({ value: record.delta, weight: decayedWeight });
    byKey[record.metricKey] = bucket;
    all.push({ value: record.delta, weight: decayedWeight });
  }

  const meanDelta = weightedMean(all);
  const totalWeight = all.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  const variance =
    totalWeight > 0
      ? all.reduce((sum, entry) => sum + Math.max(0, entry.weight) * Math.pow(entry.value - meanDelta, 2), 0) /
        totalWeight
      : 0;
  const mae =
    totalWeight > 0
      ? all.reduce((sum, entry) => sum + Math.max(0, entry.weight) * Math.abs(entry.value), 0) / totalWeight
      : 0;

  const biasesByKey: Record<string, number> = {};
  for (const [metricKey, entries] of Object.entries(byKey)) {
    biasesByKey[metricKey] = weightedMean(entries);
  }

  const stats: SegmentStats = {
    segmentId,
    sampleN: records.length,
    variance,
    mae,
    noiBias: biasesByKey.noi ?? null,
    rehabBias: biasesByKey.rehab ?? null,
    exitCapBias: biasesByKey.exit_cap ?? null,
    leaseUpBias: biasesByKey.lease_up ?? null,
  };

  await prisma.calibrationSegment.updateMany({
    where: { id: segmentId, orgId },
    data: {
      sampleN: records.length,
      variance: stats.variance,
      mae: stats.mae,
      noiBias: stats.noiBias,
      rehabBias: stats.rehabBias,
      exitCapBias: stats.exitCapBias,
      leaseUpBias: stats.leaseUpBias,
      lastUpdated: new Date(),
    },
  });

  return stats;
}

function resolveDefaultSegmentDescriptor(
  orgId: string,
  descriptor: Partial<CalibrationSegmentDescriptor> = {},
): CalibrationSegmentDescriptor {
  const vintageYear =
    typeof descriptor.vintageYear === "number" && Number.isFinite(descriptor.vintageYear)
      ? descriptor.vintageYear
      : new Date().getFullYear();

  return {
    orgId,
    propertyType: descriptor.propertyType?.trim() || "unknown",
    market: descriptor.market?.trim() || "unknown",
    strategy: descriptor.strategy?.trim() || "default",
    leverageBand: descriptor.leverageBand?.trim() || "default",
    vintageYear,
  };
}

async function resolveSegmentDescriptor(orgId: string, entityId: string): Promise<CalibrationSegmentDescriptor> {
  const entity = await prisma.internalEntity.findFirst({
    where: { id: entityId, orgId },
    select: { canonicalAddress: true, type: true, createdAt: true },
  });

  const latestComp = await prisma.memoryVerified.findFirst({
    where: { orgId, entityId, factType: "comp" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });

  const compPayload = latestComp ? parseJsonObject(latestComp.payloadJson) : {};
  const propertyType =
    typeof compPayload.property_type === "string" && compPayload.property_type.trim().length > 0
      ? compPayload.property_type.trim()
      : entity?.type ?? "property";

  const market =
    typeof compPayload.market === "string" && compPayload.market.trim().length > 0
      ? compPayload.market.trim()
      : "unknown";

  const baseDescriptor = {
    propertyType,
    market,
    strategy: "default",
    leverageBand: "default",
    vintageYear: entity?.createdAt ? entity.createdAt.getUTCFullYear() : new Date().getUTCFullYear(),
  };

  if (!entity) return resolveDefaultSegmentDescriptor(orgId, baseDescriptor);

  const addressPart =
    typeof entity.canonicalAddress === "string" && entity.canonicalAddress.length > 0
      ? entity.canonicalAddress.split(",")[0] ?? ""
      : "";
  if (propertyType === "unknown" && addressPart.length > 0) {
    baseDescriptor.propertyType = "property";
  }

  return resolveDefaultSegmentDescriptor(orgId, baseDescriptor);
}

export async function getCalibrationDelta(
  orgId: string,
  segment: CalibrationSegmentDescriptor,
): Promise<CalibrationDelta | null> {
  try {
    const now = new Date();
    const existingSegment = await prisma.calibrationSegment.findFirst({
      where: {
        orgId,
        propertyType: segment.propertyType,
        market: segment.market,
        strategy: segment.strategy,
        leverageBand: segment.leverageBand,
        vintageYear: segment.vintageYear,
      },
      select: { id: true, sampleN: true, variance: true },
    });

    if (!existingSegment || existingSegment.sampleN < CALIBRATION_MINIMUMS.MIN_N) {
      return null;
    }

    const records = await prisma.calibrationRecord.findMany({
      where: { orgId, segmentId: existingSegment.id },
      select: {
        metricKey: true,
        delta: true,
        effectiveWeight: true,
        volatilityClass: true,
        createdAt: true,
      },
    });

    if (records.length === 0) return null;

    const grouped: Record<string, Array<{ value: number; weight: number }>> = {};
    for (const record of records) {
      const entries = grouped[record.metricKey] ?? [];
      const decayedWeight = computeEffectiveWeight(
        record.effectiveWeight,
        ageInDays(record.createdAt, now),
        record.volatilityClass,
      );
      entries.push({ value: record.delta, weight: decayedWeight });
      grouped[record.metricKey] = entries;
    }

    const confidence = makeConfidence(existingSegment.sampleN, existingSegment.variance);
    return Object.entries(grouped).map(([metricKey, values]) => ({
      metricKey,
      bias: weightedMean(values),
      confidence,
      sampleN: existingSegment.sampleN,
    }));
  } catch {
    return null;
  }
}

export async function getCalibrationSegmentForEntity(
  orgId: string,
  entityId: string,
): Promise<CalibrationSegmentDescriptor | null> {
  return resolveSegmentDescriptor(orgId, entityId);
}

export async function ingestOutcome(
  orgId: string,
  dealOutcomeId: string,
  entityId: string,
  projectionSnapshot: unknown,
  finalMetrics: unknown,
): Promise<void> {
  const segmentDescriptor = await resolveSegmentDescriptor(orgId, entityId);

  const verifiedProjectionRecords = await prisma.memoryVerified.findMany({
    where: {
      orgId,
      entityId,
      factType: "projection",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });

  const projections = combineProjectionSnapshots(
    projectionSnapshot,
    verifiedProjectionRecords.map((record) => ({ payloadJson: record.payloadJson })),
  );
  const finals = combineFinalMetrics(finalMetrics);

  if (Object.keys(finals).length === 0) return;

  const segment = await loadOrCreateSegment(segmentDescriptor);
  const entries = Object.entries(finals)
    .map(([metricKey, actualValue]) => {
      const projectedValue = asNumber(projections[metricKey]);
      if (projectedValue === null || projectedValue === undefined) return null;
      return {
        segmentId: segment.id,
        dealOutcomeId,
        metricKey,
        projectedValue,
        actualValue,
        delta: actualValue - projectedValue,
        volatilityClass: volatilityForMetric(metricKey),
      };
    })
    .filter((entry): entry is Exclude<typeof entry, null> => entry !== null);

  if (entries.length === 0) return;

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.calibrationRecord.create({
        data: {
          orgId,
          segmentId: entry.segmentId,
          dealOutcomeId,
          metricKey: entry.metricKey,
          projectedValue: entry.projectedValue,
          actualValue: entry.actualValue,
          delta: entry.delta,
          volatilityClass: entry.volatilityClass,
          effectiveWeight: computeEffectiveWeight(1, 0, entry.volatilityClass),
        },
      }),
    ),
  );

  await upsertSegmentStats(orgId, segment.id);
}
