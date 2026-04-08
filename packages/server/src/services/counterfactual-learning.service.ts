import { Prisma, prisma } from "@entitlement-os/db";

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
      projectionSnapshot:
        (entry.projectionSnapshot as Prisma.InputJsonValue) ?? null,
      actualMetrics: (entry.actualMetrics as Prisma.InputJsonValue) ?? null,
      lessonsLearned: entry.lessonsLearned ?? null,
    },
  });

  return { id: record.id };
}

export async function getCounterfactualLogs(
  orgId: string,
  options?: { outcome?: string; limit?: number },
): Promise<
  Array<{
    id: string;
    dealId: string;
    outcome: string;
    rejectionReason: string | null;
    stageAtClose: string;
    projectionSnapshot: unknown;
    actualMetrics: unknown;
    lessonsLearned: string | null;
    createdAt: Date;
  }>
> {
  return prisma.counterfactualDealLog.findMany({
    where: {
      orgId,
      ...(options?.outcome ? { outcome: options.outcome } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}

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
