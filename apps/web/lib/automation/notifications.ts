import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";

export type AutomationNotificationType =
  | "veto_review"
  | "enrichment_review"
  | "kill_confirmation"
  | "advancement_suggestion"
  | "outreach_review"
  | "document_review"
  | "classification_review";

export interface CreateAutomationTaskParams {
  orgId: string;
  dealId: string;
  type: AutomationNotificationType;
  title: string;
  description: string;
  pipelineStep?: number;
  dueAt?: Date;
}

// Map automation notification types to the Notification model's type enum
const TYPE_MAP: Record<AutomationNotificationType, string> = {
  veto_review: "ALERT",
  enrichment_review: "AUTOMATION",
  kill_confirmation: "ALERT",
  advancement_suggestion: "OPPORTUNITY",
  outreach_review: "AUTOMATION",
  document_review: "AUTOMATION",
  classification_review: "AUTOMATION",
};

// Map automation types to priority
const PRIORITY_MAP: Record<AutomationNotificationType, string> = {
  veto_review: "HIGH",
  enrichment_review: "MEDIUM",
  kill_confirmation: "HIGH",
  advancement_suggestion: "MEDIUM",
  outreach_review: "LOW",
  document_review: "LOW",
  classification_review: "LOW",
};

/**
 * Create a Task record that serves as an automation notification,
 * AND create a real Notification record for each org member.
 *
 * All auto-generated tasks are prefixed with "[AUTO] " for identification.
 */
export async function createAutomationTask(params: CreateAutomationTaskParams) {
  const taskTitle = params.title.startsWith("[AUTO]")
    ? params.title
    : `[AUTO] ${params.title}`;

  // Create the task (existing behavior)
  const task = await prisma.task.create({
    data: {
      orgId: params.orgId,
      dealId: params.dealId,
      title: taskTitle,
      description: `[${params.type}] ${params.description}`,
      status: "TODO",
      pipelineStep: params.pipelineStep ?? 1,
      dueAt: params.dueAt,
    },
  });

  // Create a notification for each org member
  try {
    const members = await prisma.orgMembership.findMany({
      where: { orgId: params.orgId },
      select: { userId: true },
    });

    if (members.length > 0) {
      const notificationType = TYPE_MAP[params.type] ?? "AUTOMATION";
      const priority = PRIORITY_MAP[params.type] ?? "MEDIUM";

      await prisma.notification.createMany({
        data: members.map((m) => ({
          orgId: params.orgId,
          userId: m.userId,
          dealId: params.dealId,
          type: notificationType as Prisma.Enumnotification_typeFieldUpdateOperationsInput["set"],
          title: params.title,
          body: params.description.slice(0, 500),
          metadata: { automationType: params.type, taskId: task.id } as Prisma.InputJsonValue,
          priority: priority as Prisma.Enumnotification_priorityFieldUpdateOperationsInput["set"],
          actionUrl: `/deals/${params.dealId}`,
          sourceAgent: "automation",
        })),
      });
    }
  } catch (err) {
    // Never let notification creation failure break automation
    console.error(
      "[automation] Failed to create notification:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return task;
}
