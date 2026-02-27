import "server-only";

import { prisma } from "@entitlement-os/db";
import { computeEffectiveWeight } from "@/lib/services/calibrationDecay";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ageInDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MS_PER_DAY));
}

function weightedMean(values: Array<{ value: number; weight: number }>): number {
  let numerator = 0;
  let denominator = 0;
  for (const entry of values) {
    const weight = Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 0;
    numerator += entry.value * weight;
    denominator += weight;
  }
  return denominator <= 0 ? 0 : numerator / denominator;
}

export async function recomputeAllSegments(orgId: string): Promise<void> {
  const now = new Date();
  const segments = await prisma.calibrationSegment.findMany({
    where: { orgId },
    select: { id: true },
  });

  for (const segment of segments) {
    const records = await prisma.calibrationRecord.findMany({
      where: { orgId, segmentId: segment.id },
      select: {
        metricKey: true,
        delta: true,
        effectiveWeight: true,
        volatilityClass: true,
        createdAt: true,
      },
    });

    if (records.length === 0) {
      await prisma.calibrationSegment.updateMany({
        where: { id: segment.id, orgId },
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
      continue;
    }

    const byKey: Record<string, Array<{ value: number; weight: number }>> = {};
    const all: Array<{ value: number; weight: number }> = [];

    for (const record of records) {
      const decayedWeight = computeEffectiveWeight(
        record.effectiveWeight,
        ageInDays(record.createdAt, now),
        record.volatilityClass,
      );
      const bucket = byKey[record.metricKey] ?? [];
      bucket.push({ value: record.delta, weight: decayedWeight });
      byKey[record.metricKey] = bucket;
      all.push({ value: record.delta, weight: decayedWeight });
    }

    const meanDelta = weightedMean(all);
    const totalWeight = all.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);

    const variance =
      totalWeight > 0
        ? all.reduce(
            (sum, entry) =>
              sum + Math.max(0, entry.weight) * Math.pow(entry.value - meanDelta, 2),
            0,
          ) / totalWeight
        : 0;
    const mae =
      totalWeight > 0
        ? all.reduce(
            (sum, entry) => sum + Math.max(0, entry.weight) * Math.abs(entry.value),
            0,
          ) / totalWeight
        : 0;

    const biasesByKey: Record<string, number> = {};
    for (const [metricKey, entries] of Object.entries(byKey)) {
      biasesByKey[metricKey] = weightedMean(entries);
    }

    await prisma.calibrationSegment.updateMany({
      where: { id: segment.id, orgId },
      data: {
        sampleN: records.length,
        variance,
        mae,
        noiBias: biasesByKey.noi ?? null,
        rehabBias: biasesByKey.rehab ?? null,
        exitCapBias: biasesByKey.exit_cap ?? null,
        leaseUpBias: biasesByKey.lease_up ?? null,
        lastUpdated: new Date(),
      },
    });
  }
}
