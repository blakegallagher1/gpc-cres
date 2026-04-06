import { prisma } from "../index.js";

export async function allStepTasksDone(
  dealId: string,
  orgId: string,
  pipelineStep: number,
): Promise<{ done: boolean; total: number; completed: number }> {
  const where = { dealId, deal: { orgId }, pipelineStep } as const;
  const tasks = await prisma.task.findMany({
    where,
    select: { status: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  if (tasks.length === 0) {
    return { done: false, total: 0, completed: 0 };
  }

  const completed = tasks.filter((task) => task.status === "DONE").length;
  if (tasks.length === 500) {
    const total = await prisma.task.count({ where });
    if (total > tasks.length) {
      return { done: false, total, completed };
    }
  }

  return { done: completed === tasks.length, total: tasks.length, completed };
}
