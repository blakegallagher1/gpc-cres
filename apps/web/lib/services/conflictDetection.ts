import "server-only";
import { prisma } from "@entitlement-os/db";
import type { MemoryVerified } from "@entitlement-os/db";

const SINGLE_TRUTH_KEYS: Record<string, string[]> = {
  comp: ["noi", "sale_price", "pad_count", "cap_rate"],
  lender_term: ["min_dscr", "max_ltv"],
  tour_observation: ["condition_rating"],
  projection: ["projected_value"],
};

interface ConflictResult {
  hasConflict: boolean;
  conflictingRecords: MemoryVerified[];
  conflictKeys: string[];
}

function getJsonPayload(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object") {
    return {};
  }
  return record as Record<string, unknown>;
}

function toComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.join("|");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

export async function detectConflicts(
  entityId: string,
  orgId: string,
  factType: string,
  payload: Record<string, unknown>,
): Promise<ConflictResult> {
  try {
  const singleTruthKeys = SINGLE_TRUTH_KEYS[factType];

  if (!singleTruthKeys || factType === "correction") {
    return { hasConflict: false, conflictingRecords: [], conflictKeys: [] };
  }

  const existingRecords = await prisma.memoryVerified.findMany({
    where: { entityId, orgId, factType },
  });

  if (existingRecords.length === 0) {
    return { hasConflict: false, conflictingRecords: [], conflictKeys: [] };
  }

  const conflictKeys = new Set<string>();
  const conflictingRecordIds = new Set<string>();
  const conflictingRecords: MemoryVerified[] = [];

  const incomingMetricKey = factType === "projection" ? payload.metric_key : undefined;

  for (const record of existingRecords) {
    const recordPayload = getJsonPayload(record.payloadJson);

    if (
      factType === "projection" &&
      recordPayload.metric_key !== incomingMetricKey
    ) {
      continue;
    }

    const keysToCheck =
      factType === "projection" ? ["projected_value"] : singleTruthKeys;

    let recordConflicts = false;

    for (const key of keysToCheck) {
      if (!(key in payload)) {
        continue;
      }

      const incomingValue = toComparableValue(payload[key]);
      const existingValue = toComparableValue(recordPayload[key]);

      if (incomingValue === null || incomingValue === undefined) {
        continue;
      }
      if (existingValue === null || existingValue === undefined) {
        continue;
      }

      if (incomingValue !== existingValue) {
        conflictKeys.add(key);
        recordConflicts = true;
      }
    }

    if (recordConflicts && !conflictingRecordIds.has(record.id)) {
      conflictingRecords.push(record);
      conflictingRecordIds.add(record.id);
    }
  }

  return {
    hasConflict: conflictKeys.size > 0,
    conflictingRecords,
    conflictKeys: Array.from(conflictKeys),
  };
  } catch {
    return { hasConflict: false, conflictingRecords: [], conflictKeys: [] };
  }
}
