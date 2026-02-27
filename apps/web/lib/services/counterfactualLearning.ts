import "server-only";

import { prisma, Prisma } from "@entitlement-os/db";

/**
 * Counterfactual learning — logs passed/lost deals with rejection taxonomy
 * for portfolio-level learning.
 *
 * When a deal closes (won or lost), record the outcome with context:
 * - Why was it rejected (if applicable)?
 * - What stage was it at when closed?
 * - What were the projections vs actuals?
 * - What lessons were learned?
 */

export interface CounterfactualEntry {
  orgId: string;
  dealId: string;
  outcome: "won" | "lost" | "passed" | "expired";
  rejectionReason?: string;
  stageAtClose: string;
  projectionSnapshot?: Record<string, unknown>;
  actualMetrics?: Record<string, unknown>;
  lessonsLearned?: string;
}

/**
 * Log a counterfactual deal outcome.
 */
export async function logCounterfactual(
  entry: CounterfactualEntry,
): Promise<{ id: string }> {
  const record = await prisma.counterfactualDealLog.create({
    data: {
      orgId: entry.orgId,
      dealId: entry.dealId,
      outcome: entry.outcome,
      rejectionReason: entry.rejectionReason ?? null,
      stageAtClose: entry.stageAtClose,
      projectionSnapshot: (entry.projectionSnapshot as Prisma.InputJsonValue) ?? undefined,
      actualMetrics: (entry.actualMetrics as Prisma.InputJsonValue) ?? undefined,
      lessonsLearned: entry.lessonsLearned ?? undefined,
    },
  });

  return { id: record.id };
}

/**
 * Get counterfactual logs for an org, optionally filtered by outcome.
 */
export async function getCounterfactualLogs(
  orgId: string,
  options?: { outcome?: string; limit?: number },
): Promise<Array<{
  id: string;
  dealId: string;
  outcome: string;
  rejectionReason: string | null;
  stageAtClose: string;
  projectionSnapshot: unknown;
  actualMetrics: unknown;
  lessonsLearned: string | null;
  createdAt: Date;
}>> {
  return prisma.counterfactualDealLog.findMany({
    where: {
      orgId,
      ...(options?.outcome ? { outcome: options.outcome } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}

/**
 * Get portfolio-level summary of deal outcomes.
 */
export async function getOutcomeSummary(
  orgId: string,
): Promise<Record<string, number>> {
  const logs = await prisma.counterfactualDealLog.groupBy({
    by: ["outcome"],
    where: { orgId },
    _count: { id: true },
  });

  const summary: Record<string, number> = {};
  for (const row of logs) {
    summary[row.outcome] = row._count.id;
  }
  return summary;
}
