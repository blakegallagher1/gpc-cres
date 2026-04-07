import { prisma } from "@entitlement-os/db";
import { getNotificationService } from "../notifications/notification.service";

export interface DeadlineJobResult {
  success: boolean;
  tasksScanned: number;
  notificationsCreated: number;
  errors: string[];
  duration_ms: number;
}

type DeadlineTier = "APPROACHING" | "IMMINENT" | "OVERDUE" | "CRITICAL";

function classifyDeadline(dueAt: Date, now: Date): DeadlineTier | null {
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3600000;

  if (hoursUntilDue <= -48) return "CRITICAL";
  if (hoursUntilDue <= 0) return "OVERDUE";
  if (hoursUntilDue <= 24) return "IMMINENT";
  if (hoursUntilDue <= 72) return "APPROACHING";
  return null;
}

const TIER_PRIORITY: Record<DeadlineTier, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  APPROACHING: "LOW",
  IMMINENT: "MEDIUM",
  OVERDUE: "HIGH",
  CRITICAL: "CRITICAL",
};

const TIER_TITLE: Record<DeadlineTier, (taskTitle: string, dealName: string) => string> = {
  APPROACHING: (taskTitle, dealName) => `Deadline approaching: "${taskTitle}" on ${dealName}`,
  IMMINENT: (taskTitle, dealName) => `Due within 24h: "${taskTitle}" on ${dealName}`,
  OVERDUE: (taskTitle, dealName) => `Overdue: "${taskTitle}" on ${dealName}`,
  CRITICAL: (taskTitle, dealName) => `Critical - 48h+ overdue: "${taskTitle}" on ${dealName}`,
};

const TIER_BODY: Record<DeadlineTier, (dueAt: Date) => string> = {
  APPROACHING: (dueAt) =>
    `This task is due ${dueAt.toLocaleDateString()}. Plan ahead to avoid delays.`,
  IMMINENT: (dueAt) => `This task is due ${dueAt.toLocaleDateString()} - less than 24 hours remain.`,
  OVERDUE: (dueAt) => `This task was due ${dueAt.toLocaleDateString()} and is now overdue.`,
  CRITICAL: (dueAt) =>
    `This task was due ${dueAt.toLocaleDateString()} and has been overdue for more than 48 hours. Immediate attention required.`,
};

export class DeadlineMonitorJob {
  async execute(): Promise<DeadlineJobResult> {
    const start = Date.now();
    const errors: string[] = [];
    let tasksScanned = 0;
    let notificationsCreated = 0;

    try {
      const now = new Date();
      const seventyTwoHoursFromNow = new Date(now.getTime() + 72 * 3600000);

      const tasks = await prisma.task.findMany({
        where: {
          dueAt: {
            not: null,
            lte: seventyTwoHoursFromNow,
          },
          status: { notIn: ["DONE", "CANCELED"] },
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          ownerUserId: true,
          deal: {
            select: {
              id: true,
              name: true,
              orgId: true,
            },
          },
        },
      });

      tasksScanned = tasks.length;
      const notificationService = getNotificationService();
      const tierByTaskId = new Map<string, DeadlineTier>();
      for (const task of tasks) {
        if (!task.dueAt) continue;
        const tier = classifyDeadline(task.dueAt, now);
        if (tier) tierByTaskId.set(task.id, tier);
      }

      const taskIdsWithTiers = Array.from(tierByTaskId.keys());
      const existingNotifications =
        taskIdsWithTiers.length > 0
          ? await prisma.notification.findMany({
              where: {
                type: "DEADLINE",
                OR: taskIdsWithTiers.map((taskId) => ({
                  metadata: { path: ["taskId"], equals: taskId },
                })),
              },
              select: { metadata: true },
            })
          : [];

      const notifiedKeys = new Set<string>(
        existingNotifications.flatMap((notification) => {
          const metadata = notification.metadata as Record<string, unknown> | null;
          const taskId = metadata?.taskId;
          const tier = metadata?.tier;
          return typeof taskId === "string" && typeof tier === "string"
            ? [`${taskId}:${tier}`]
            : [];
        }),
      );

      const orgIdsNeedingMembers = new Set<string>();
      for (const task of tasks) {
        const tier = tierByTaskId.get(task.id);
        if (!tier) continue;
        if (notifiedKeys.has(`${task.id}:${tier}`)) continue;
        if (!task.ownerUserId) orgIdsNeedingMembers.add(task.deal.orgId);
      }

      const allMembers =
        orgIdsNeedingMembers.size > 0
          ? await prisma.orgMembership.findMany({
              where: { orgId: { in: Array.from(orgIdsNeedingMembers) } },
              select: { orgId: true, userId: true },
            })
          : [];

      const membersByOrgId = new Map<string, string[]>();
      for (const member of allMembers) {
        const list = membersByOrgId.get(member.orgId) ?? [];
        list.push(member.userId);
        membersByOrgId.set(member.orgId, list);
      }

      for (const task of tasks) {
        const tier = tierByTaskId.get(task.id);
        if (!tier || !task.dueAt) continue;

        try {
          if (notifiedKeys.has(`${task.id}:${tier}`)) continue;

          const recipients: string[] = [];
          if (task.ownerUserId) {
            recipients.push(task.ownerUserId);
          } else {
            recipients.push(...(membersByOrgId.get(task.deal.orgId) ?? []));
          }

          for (const userId of recipients) {
            await notificationService.create({
              orgId: task.deal.orgId,
              userId,
              dealId: task.deal.id,
              type: "DEADLINE",
              title: TIER_TITLE[tier](task.title, task.deal.name),
              body: TIER_BODY[tier](task.dueAt),
              priority: TIER_PRIORITY[tier],
              actionUrl: `/deals/${task.deal.id}`,
              sourceAgent: "deadline-monitor",
              metadata: {
                taskId: task.id,
                tier,
                dueAt: task.dueAt.toISOString(),
              },
            });
            notificationsCreated += 1;
          }
        } catch (taskError) {
          const message = `Task "${task.title}" (${task.id}): ${
            taskError instanceof Error ? taskError.message : String(taskError)
          }`;
          errors.push(message);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {
      success: errors.length === 0,
      tasksScanned,
      notificationsCreated,
      errors,
      duration_ms: Date.now() - start,
    };
  }
}
