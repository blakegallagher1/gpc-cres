import { prisma } from "@entitlement-os/db";
import { getNotificationService } from "@/lib/services/notification.service";
import { AUTOMATION_CONFIG } from "./config";

export interface DeadlineMonitoringResult {
  tasksScanned: number;
  notificationTasksCreated: number;
  escalatedHighPriority: number;
  notificationsCreated: number;
}

function buildFollowupTitle(sourceTitle: string, escalated: boolean): string {
  const suffix = escalated ? " [HIGH]" : "";
  return `[AUTO] Overdue follow-up${suffix}: ${sourceTitle}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function sourceMarker(taskId: string): string {
  return `sourceTaskId=${taskId}`;
}

/** Extract the originating task ID from a follow-up task description, or null if absent. */
function parseSourceTaskId(description: string): string | null {
  // Marker format: "sourceTaskId=<id>" — matches up to the next whitespace/newline
  const match = /sourceTaskId=([^\n\s]+)/.exec(description);
  return match?.[1] ?? null;
}

/**
 * E2: Deadline monitoring automation.
 * - Finds overdue tasks (dueAt < now, status != DONE)
 * - Creates [AUTO] follow-up task assigned to deal owner (task owner if set, else deal creator)
 * - Escalates priority to HIGH when stale age > threshold
 */
export async function runDeadlineMonitoring(now = new Date()): Promise<DeadlineMonitoringResult> {
  const overdueTasks = await prisma.task.findMany({
    where: {
      dueAt: { lt: now },
      status: { not: "DONE" },
    },
    select: {
      id: true,
      orgId: true,
      dealId: true,
      title: true,
      status: true,
      dueAt: true,
      createdAt: true,
      ownerUserId: true,
      deal: {
        select: {
          id: true,
          name: true,
          createdBy: true,
        },
      },
    },
  });

  const dedupeCutoff = new Date(
    now.getTime() -
      AUTOMATION_CONFIG.deadlineMonitoring.dedupeWindowHours * 60 * 60 * 1000,
  );
  const taskDueAt = new Date(
    now.getTime() +
      AUTOMATION_CONFIG.deadlineMonitoring.notificationTaskDueHours *
        60 *
        60 *
        1000,
  );
  const notificationService = getNotificationService();

  let notificationTasksCreated = 0;
  let escalatedHighPriority = 0;
  let notificationsCreated = 0;

  // Batch-fetch all recent [AUTO] follow-up tasks for the affected deals in one query.
  // The sourceMarker (e.g. "sourceTaskId=<id>") uniquely identifies each origin task,
  // so we only need to check the description rather than a per-row findFirst.
  const dealIds = [...new Set(overdueTasks.map((t) => t.dealId))];
  const recentAutoTasks =
    dealIds.length > 0
      ? await prisma.task.findMany({
          where: {
            dealId: { in: dealIds },
            createdAt: { gte: dedupeCutoff },
          },
          select: { description: true },
        })
      : [];

  // Build a Set of source task IDs that already have a follow-up within the dedup window
  const dedupedSourceIds = new Set<string>();
  for (const t of recentAutoTasks) {
    if (!t.description) continue;
    const id = parseSourceTaskId(t.description);
    if (id) dedupedSourceIds.add(id);
  }

  for (const task of overdueTasks) {
    if (!task.dueAt) continue;

    const ownerUserId = task.ownerUserId ?? task.deal.createdBy;
    const overdueDays = Math.max(daysBetween(task.dueAt, now), 0);
    const staleDays = Math.max(daysBetween(task.createdAt, now), 0);
    const escalated =
      staleDays > AUTOMATION_CONFIG.deadlineMonitoring.escalationAgeDays;
    const title = buildFollowupTitle(task.title, escalated);

    if (dedupedSourceIds.has(task.id)) continue;

    await prisma.task.create({
      data: {
        orgId: task.orgId,
        dealId: task.dealId,
        ownerUserId,
        title,
        description:
          `${sourceMarker(task.id)}\n` +
          `Source task "${task.title}" is overdue by ${overdueDays} day(s). ` +
          "Review immediately and update status.",
        status: "TODO",
        pipelineStep: escalated ? 5 : 3,
        dueAt: taskDueAt,
      },
    });
    notificationTasksCreated += 1;
    if (escalated) escalatedHighPriority += 1;

    await notificationService.create({
      orgId: task.orgId,
      userId: ownerUserId,
      dealId: task.dealId,
      type: "DEADLINE",
      title,
      body:
        `Task "${task.title}" on ${task.deal.name} is overdue by ${overdueDays} day(s).` +
        (escalated ? " Escalated to HIGH priority." : ""),
      priority: escalated ? "HIGH" : "MEDIUM",
      actionUrl: `/deals/${task.dealId}`,
      sourceAgent: "deadline-monitoring",
      metadata: {
        sourceTaskId: task.id,
        overdueDays,
        staleDays,
        escalated,
      },
    });
    notificationsCreated += 1;
  }

  return {
    tasksScanned: overdueTasks.length,
    notificationTasksCreated,
    escalatedHighPriority,
    notificationsCreated,
  };
}
