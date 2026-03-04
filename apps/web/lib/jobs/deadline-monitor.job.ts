import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { getNotificationService } from "@/lib/services/notification.service";

export interface DeadlineJobResult {
  success: boolean;
  tasksScanned: number;
  notificationsCreated: number;
  errors: string[];
  duration_ms: number;
}

type DeadlineTier = "APPROACHING" | "IMMINENT" | "OVERDUE" | "CRITICAL";

interface DeadlineTask {
  id: string;
  title: string;
  dueAt: Date;
  status: string;
  deal: {
    id: string;
    name: string;
    orgId: string;
  };
  ownerUserId: string | null;
}

function classifyDeadline(dueAt: Date, now: Date): DeadlineTier | null {
  const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3600000;

  if (hoursUntilDue <= -48) return "CRITICAL"; // 48h+ overdue
  if (hoursUntilDue <= 0) return "OVERDUE"; // overdue (0-48h)
  if (hoursUntilDue <= 24) return "IMMINENT"; // due within 24h
  if (hoursUntilDue <= 72) return "APPROACHING"; // due within 72h
  return null; // more than 72h away — no notification
}

const TIER_PRIORITY: Record<DeadlineTier, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  APPROACHING: "LOW",
  IMMINENT: "MEDIUM",
  OVERDUE: "HIGH",
  CRITICAL: "CRITICAL",
};

const TIER_TITLE: Record<DeadlineTier, (taskTitle: string, dealName: string) => string> = {
  APPROACHING: (t, d) => `Deadline approaching: "${t}" on ${d}`,
  IMMINENT: (t, d) => `Due within 24h: "${t}" on ${d}`,
  OVERDUE: (t, d) => `Overdue: "${t}" on ${d}`,
  CRITICAL: (t, d) => `Critical — 48h+ overdue: "${t}" on ${d}`,
};

const TIER_BODY: Record<DeadlineTier, (dueAt: Date) => string> = {
  APPROACHING: (d) => `This task is due ${d.toLocaleDateString()}. Plan ahead to avoid delays.`,
  IMMINENT: (d) => `This task is due ${d.toLocaleDateString()} — less than 24 hours remain.`,
  OVERDUE: (d) => `This task was due ${d.toLocaleDateString()} and is now overdue.`,
  CRITICAL: (d) => `This task was due ${d.toLocaleDateString()} and has been overdue for more than 48 hours. Immediate attention required.`,
};

// DeadlineMonitorJob — runs hourly via Vercel Cron.
//
// 1. Query all tasks with dueAt set that are not DONE or CANCELED
// 2. Classify each into urgency tiers
// 3. Deduplicate: check if a notification already exists for this task+tier
// 4. Create tiered notifications for task owners (or org-wide if no owner)
export class DeadlineMonitorJob {
  async execute(): Promise<DeadlineJobResult> {
    const start = Date.now();
    const errors: string[] = [];
    let tasksScanned = 0;
    let notificationsCreated = 0;

    try {
      const now = new Date();
      // Look for tasks with deadlines: already overdue or coming up within 72h
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

      // Pre-classify tiers so we know which (task, tier) pairs to check
      const tierByTaskId = new Map<string, DeadlineTier>();
      for (const task of tasks) {
        if (!task.dueAt) continue;
        const tier = classifyDeadline(task.dueAt, now);
        if (tier) tierByTaskId.set(task.id, tier);
      }

      // Batch-fetch existing DEADLINE notifications for all relevant tasks (one query)
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

      // Build a Set of "taskId:tier" keys for O(1) dedup lookup
      const notifiedKeys = new Set<string>(
        existingNotifications.flatMap((n) => {
          const meta = n.metadata as Record<string, unknown> | null;
          const taskId = meta?.taskId;
          const tier = meta?.tier;
          return typeof taskId === "string" && typeof tier === "string"
            ? [`${taskId}:${tier}`]
            : [];
        }),
      );

      // Batch-fetch org memberships for orgIds that have tasks without an owner
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

      // Group members by orgId for O(1) lookup
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
          if (notifiedKeys.has(`${task.id}:${tier}`)) continue; // Already notified for this task+tier

          // Determine recipient: task owner if assigned, otherwise all org members
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
            notificationsCreated++;
          }
        } catch (taskErr) {
          const msg = `Task "${task.title}" (${task.id}): ${taskErr instanceof Error ? taskErr.message : String(taskErr)}`;
          errors.push(msg);
          console.error("[deadline-monitor]", msg);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
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
