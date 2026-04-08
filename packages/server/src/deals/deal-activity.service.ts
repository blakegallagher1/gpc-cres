import { prisma } from "@entitlement-os/db";

export type DealActivityItem = {
  type: "run" | "task" | "upload" | "message";
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export class DealNotFoundError extends Error {
  constructor() {
    super("Deal not found");
    this.name = "DealNotFoundError";
  }
}

export async function getDealActivity(input: {
  dealId: string;
  orgId: string;
}): Promise<DealActivityItem[]> {
  const deal = await prisma.deal.findFirst({
    where: { id: input.dealId, orgId: input.orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new DealNotFoundError();
  }

  const items: DealActivityItem[] = [];
  const [runs, tasks, uploads, conversation] = await Promise.all([
    prisma.run.findMany({
      where: { dealId: input.dealId, orgId: input.orgId },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: { dealId: input.dealId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.upload.findMany({
      where: { dealId: input.dealId, orgId: input.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.conversation.findFirst({
      where: { dealId: input.dealId, orgId: input.orgId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
  ]);

  for (const run of runs) {
    items.push({
      type: "run",
      timestamp: (run.finishedAt ?? run.startedAt).toISOString(),
      description: `${run.runType} run ${run.status}`,
      metadata: { runId: run.id, status: run.status, runType: run.runType },
    });
  }

  for (const task of tasks) {
    items.push({
      type: "task",
      timestamp: task.createdAt.toISOString(),
      description: `Task "${task.title}" created (${task.status})`,
      metadata: { taskId: task.id, status: task.status },
    });
  }

  for (const upload of uploads) {
    items.push({
      type: "upload",
      timestamp: upload.createdAt.toISOString(),
      description: `Uploaded "${upload.filename}" (${upload.kind})`,
      metadata: { uploadId: upload.id, kind: upload.kind },
    });
  }

  if (conversation) {
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, role: true, agentName: true, content: true, createdAt: true },
    });

    for (const message of messages) {
      const preview =
        message.content.length > 100
          ? `${message.content.slice(0, 100)}...`
          : message.content;
      items.push({
        type: "message",
        timestamp: message.createdAt.toISOString(),
        description: `${message.agentName || message.role}: ${preview}`,
        metadata: { messageId: message.id, role: message.role },
      });
    }
  }

  items.sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );

  return items.slice(0, 50);
}
