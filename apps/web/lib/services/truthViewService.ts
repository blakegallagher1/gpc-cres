import "server-only";
import { prisma } from "@entitlement-os/db";
import type { MemoryVerified } from "@entitlement-os/db";

interface TruthValue {
  value: unknown;
  source: string;
  verifiedAt: string;
  correctedBy?: string;
}

interface OpenConflict {
  key: string;
  values: unknown[];
  draftIds: string[];
}

interface CorrectionEntry {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  correctedAt: string;
}

export interface TruthView {
  currentValues: Record<string, TruthValue>;
  openConflicts: Array<OpenConflict>;
  corrections: Array<CorrectionEntry>;
}

function getPayloadValues(record: MemoryVerified): Record<string, unknown> {
  if (!record.payloadJson || typeof record.payloadJson !== "object") {
    return {};
  }

  return record.payloadJson as Record<string, unknown>;
}

export async function getTruthView(
  entityId: string,
  orgId: string,
): Promise<TruthView> {
  try {
  const [verifiedRecords, draftRecords] = await Promise.all([
    prisma.memoryVerified.findMany({
      where: { entityId, orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.memoryDraft.findMany({
      where: { entityId, orgId, conflictFlag: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const currentValues: Record<string, TruthValue> = {};
  const corrections: Array<CorrectionEntry> = [];
  const correctionRecords = verifiedRecords.filter(
    (record) => record.factType === "correction",
  );
  const nonCorrectionRecords = verifiedRecords.filter(
    (record) => record.factType !== "correction",
  );

  for (const record of nonCorrectionRecords) {
    const payload = getPayloadValues(record);

    for (const [fieldKey, value] of Object.entries(payload)) {
      const key = `${record.factType}.${fieldKey}`;
      if (!(key in currentValues)) {
        currentValues[key] = {
          value,
          source: record.sourceType,
          verifiedAt: record.createdAt.toISOString(),
        };
      }
    }
  }

  for (const correction of correctionRecords) {
    const payload = getPayloadValues(correction);
    const correctionKey = payload.corrected_attribute_key;
    if (typeof correctionKey !== "string" || !correctionKey) {
      continue;
    }

    const existing = currentValues[correctionKey];
    corrections.push({
      key: correctionKey,
      oldValue: existing?.value ?? null,
      newValue: payload.corrected_value,
      reason: typeof payload.correction_reason === "string" ? payload.correction_reason : "",
      correctedAt: correction.createdAt.toISOString(),
    });

    if (currentValues[correctionKey]?.correctedBy) {
      continue;
    }

    currentValues[correctionKey] = {
      value: payload.corrected_value,
      source: "correction",
      verifiedAt: correction.createdAt.toISOString(),
      correctedBy: correction.id,
    };
  }

  const conflictMap = new Map<string, { values: unknown[]; draftIds: string[] }>();

  for (const draft of draftRecords) {
    const payload = getPayloadValues(draft);

    for (const [fieldKey, value] of Object.entries(payload)) {
      const key = `${draft.factType}.${fieldKey}`;

      const existing = conflictMap.get(key);
      if (existing) {
        existing.values.push(value);
        existing.draftIds.push(draft.id);
      } else {
        conflictMap.set(key, {
          values: [value],
          draftIds: [draft.id],
        });
      }
    }
  }

  return {
    currentValues,
    openConflicts: [...conflictMap.entries()].map(([key, value]) => ({
      key,
      values: value.values,
      draftIds: value.draftIds,
    }),
    ),
    corrections,
  };
  } catch {
    return {
      currentValues: {},
      openConflicts: [],
      corrections: [],
    };
  }
}
