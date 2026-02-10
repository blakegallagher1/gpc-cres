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

      for (const task of tasks) {
        if (!task.dueAt) continue;

        const tier = classifyDeadline(task.dueAt, now);
        if (!tier) continue;

        try {
          // Deduplicate: check if we already sent this tier for this task
          const existing = await prisma.notification.findFirst({
            where: {
              type: "DEADLINE",
              metadata: {
                path: ["taskId"],
                equals: task.id,
              },
              // Check for same tier in metadata
              AND: {
                metadata: {
                  path: ["tier"],
                  equals: tier,
                },
              },
            },
            select: { id: true },
          });

          if (existing) continue; // Already notified for this task+tier

          // Determine recipient: task owner if assigned, otherwise all org members
          const recipients: string[] = [];

          if (task.ownerUserId) {
            recipients.push(task.ownerUserId);
          } else {
            // Notify all org members
            const members = await prisma.orgMembership.findMany({
              where: { orgId: task.deal.orgId },
              select: { userId: true },
            });
            recipients.push(...members.map((m) => m.userId));
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
