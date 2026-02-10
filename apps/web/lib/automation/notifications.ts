import { prisma } from "@entitlement-os/db";

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

/**
 * Create a Task record that serves as an automation notification.
 * All auto-generated tasks are prefixed with "[AUTO] " for identification.
 */
export async function createAutomationTask(params: CreateAutomationTaskParams) {
  return prisma.task.create({
    data: {
      orgId: params.orgId,
      dealId: params.dealId,
      title: params.title.startsWith("[AUTO]") ? params.title : `[AUTO] ${params.title}`,
      description: `[${params.type}] ${params.description}`,
      status: "TODO",
      pipelineStep: params.pipelineStep ?? 1,
      dueAt: params.dueAt,
    },
  });
}
