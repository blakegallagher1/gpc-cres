import { prisma, Prisma } from "@entitlement-os/db";
import type { DealStageKey } from "@entitlement-os/shared";

export interface StageHistoryEntry {
  id: string;
  dealId: string;
  fromStageKey: string | null;
  toStageKey: string;
  changedBy: string | null;
  changedAt: string;
  note: string | null;
  decisionCriteria: Record<string, unknown> | null;
  decisionMetrics: Record<string, unknown> | null;
  decisionRationale: string | null;
  approvalRequestId: string | null;
}

export interface RecordStageTransitionInput {
  orgId: string;
  dealId: string;
  fromStageKey: DealStageKey | null;
  toStageKey: DealStageKey;
  changedBy: string | null;
  note?: string | null;
  decisionCriteria?: Record<string, unknown> | null;
  decisionMetrics?: Record<string, unknown> | null;
  decisionRationale?: string | null;
  approvalRequestId?: string | null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function recordStageTransition(
  input: RecordStageTransitionInput,
): Promise<StageHistoryEntry> {
  const row = await prisma.dealStageHistory.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      fromStageKey: input.fromStageKey,
      toStageKey: input.toStageKey,
      changedBy: input.changedBy,
      note: input.note ?? null,
      decisionCriteria:
        input.decisionCriteria === null || input.decisionCriteria === undefined
          ? Prisma.JsonNull
          : (input.decisionCriteria as Prisma.InputJsonValue),
      decisionMetrics:
        input.decisionMetrics === null || input.decisionMetrics === undefined
          ? Prisma.JsonNull
          : (input.decisionMetrics as Prisma.InputJsonValue),
      decisionRationale: input.decisionRationale ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
    },
  });
  return normalize(row);
}

export async function listStageHistory(
  orgId: string,
  dealId: string,
  limit = 50,
): Promise<StageHistoryEntry[]> {
  const rows = await prisma.dealStageHistory.findMany({
    where: { orgId, dealId },
    orderBy: { changedAt: "desc" },
    take: limit,
  });
  return rows.map(normalize);
}

function normalize(row: {
  id: string;
  dealId: string;
  fromStageKey: string | null;
  toStageKey: string;
  changedBy: string | null;
  changedAt: Date;
  note: string | null;
  decisionCriteria: unknown;
  decisionMetrics: unknown;
  decisionRationale: string | null;
  approvalRequestId: string | null;
}): StageHistoryEntry {
  return {
    id: row.id,
    dealId: row.dealId,
    fromStageKey: row.fromStageKey ?? null,
    toStageKey: row.toStageKey,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
    note: row.note,
    decisionCriteria: toRecord(row.decisionCriteria),
    decisionMetrics: toRecord(row.decisionMetrics),
    decisionRationale: row.decisionRationale,
    approvalRequestId: row.approvalRequestId,
  };
}
