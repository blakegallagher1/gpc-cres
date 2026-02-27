import "server-only";

import { prisma } from "@entitlement-os/db";

/**
 * Anomaly detection for memory writes.
 *
 * Computes an anomaly_score (0-1) by checking how far the payload's
 * numeric values deviate from existing verified records for the same
 * entity + factType.  Uses z-score approach: if mean/stddev are available,
 * score = fraction of payload numeric fields with |z| > 2.
 */

interface AnomalyInput {
  orgId: string;
  entityId: string;
  factType: string;
  payload: Record<string, unknown>;
}

function isNumeric(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Compute anomaly score for a memory write.
 * Returns 0.0 (no anomaly) to 1.0 (highly anomalous).
 */
export async function computeAnomalyScore(input: AnomalyInput): Promise<number> {
  const numericKeys: string[] = [];
  const numericValues: Record<string, number> = {};

  for (const [key, value] of Object.entries(input.payload)) {
    if (isNumeric(value)) {
      numericKeys.push(key);
      numericValues[key] = value;
    }
  }

  if (numericKeys.length === 0) return 0.0;

  const existing = await prisma.memoryVerified.findMany({
    where: { orgId: input.orgId, entityId: input.entityId, factType: input.factType },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { payloadJson: true },
  });

  if (existing.length < 3) return 0.0;

  // Build per-key distributions from existing verified records
  const distributions: Record<string, number[]> = {};
  for (const key of numericKeys) {
    distributions[key] = [];
  }

  for (const record of existing) {
    const p =
      typeof record.payloadJson === "object" && record.payloadJson !== null
        ? (record.payloadJson as Record<string, unknown>)
        : {};
    for (const key of numericKeys) {
      const val = p[key];
      if (isNumeric(val)) {
        distributions[key].push(val);
      }
    }
  }

  let anomalousKeys = 0;
  let comparableKeys = 0;

  for (const key of numericKeys) {
    const values = distributions[key];
    if (values.length < 3) continue;

    comparableKeys++;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) {
      // All historical values identical — any deviation is anomalous
      if (numericValues[key] !== mean) {
        anomalousKeys++;
      }
      continue;
    }

    const zScore = Math.abs((numericValues[key] - mean) / stddev);
    if (zScore > 2) {
      anomalousKeys++;
    }
  }

  if (comparableKeys === 0) return 0.0;
  return Math.min(1, anomalousKeys / comparableKeys);
}
