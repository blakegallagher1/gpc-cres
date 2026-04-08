import { prisma } from "@entitlement-os/db";

interface AnomalyInput {
  orgId: string;
  entityId: string;
  factType: string;
  payload: Record<string, unknown>;
}

function isNumeric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function computeAnomalyScore(input: AnomalyInput): Promise<number> {
  const numericKeys: string[] = [];
  const numericValues: Record<string, number> = {};

  for (const [key, value] of Object.entries(input.payload)) {
    if (isNumeric(value)) {
      numericKeys.push(key);
      numericValues[key] = value;
    }
  }

  if (numericKeys.length === 0) {
    return 0;
  }

  const existing = await prisma.memoryVerified.findMany({
    where: {
      orgId: input.orgId,
      entityId: input.entityId,
      factType: input.factType,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { payloadJson: true },
  });

  if (existing.length < 3) {
    return 0;
  }

  const distributions: Record<string, number[]> = {};
  for (const key of numericKeys) {
    distributions[key] = [];
  }

  for (const record of existing) {
    const payload =
      typeof record.payloadJson === "object" && record.payloadJson !== null
        ? (record.payloadJson as Record<string, unknown>)
        : {};

    for (const key of numericKeys) {
      const value = payload[key];
      if (isNumeric(value)) {
        distributions[key].push(value);
      }
    }
  }

  let anomalousKeys = 0;
  let comparableKeys = 0;

  for (const key of numericKeys) {
    const values = distributions[key];
    if (values.length < 3) {
      continue;
    }

    comparableKeys += 1;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) {
      if (numericValues[key] !== mean) {
        anomalousKeys += 1;
      }
      continue;
    }

    const zScore = Math.abs((numericValues[key] - mean) / stddev);
    if (zScore > 2) {
      anomalousKeys += 1;
    }
  }

  if (comparableKeys === 0) {
    return 0;
  }

  return Math.min(1, anomalousKeys / comparableKeys);
}
