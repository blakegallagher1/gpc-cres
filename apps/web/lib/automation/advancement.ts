import { prisma } from "@entitlement-os/db";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./types";
import type { DealStatus } from "@entitlement-os/shared";
import {
  getAutomationDealContext,
  getCurrentWorkflowStage,
  getNextWorkflowStage,
  getWorkflowPipelineStep,
} from "./context";

/**
 * Legacy compatibility helper retained until compatibility-only status readers
 * can be fully removed after the release soak period.
 */
const STAGE_TRANSITIONS: ReadonlyArray<{
  from: DealStatus;
  to: DealStatus;
  pipelineStep: number;
  criteriaDescription: string;
}> = [
  { from: "TRIAGE_DONE", to: "PREAPP", pipelineStep: 2, criteriaDescription: "All Step 2 tasks completed and triage decision is ADVANCE" },
  { from: "PREAPP", to: "CONCEPT", pipelineStep: 3, criteriaDescription: "Pre-app meeting notes uploaded and all Step 3 tasks completed" },
  { from: "CONCEPT", to: "NEIGHBORS", pipelineStep: 4, criteriaDescription: "Concept plan uploaded and site plan approved" },
  { from: "NEIGHBORS", to: "SUBMITTED", pipelineStep: 5, criteriaDescription: "Neighbor notification complete and no unresolved objections" },
  { from: "SUBMITTED", to: "HEARING", pipelineStep: 6, criteriaDescription: "Application submitted and hearing date set" },
  { from: "HEARING", to: "APPROVED", pipelineStep: 7, criteriaDescription: "Hearing outcome approved" },
  { from: "APPROVED", to: "EXIT_MARKETED", pipelineStep: 8, criteriaDescription: "Exit package generated and deal listed for sale" },
];

const NON_TASK_DRIVEN_STAGE_KEYS = new Set([
  "ORIGINATION",
  "DISPOSITION",
  "CLOSED_WON",
  "CLOSED_LOST",
]);

/**
 * Get the next stage transition for a given deal status.
 */
export function getNextTransition(
  status: DealStatus
): (typeof STAGE_TRANSITIONS)[number] | null {
  return STAGE_TRANSITIONS.find((t) => t.from === status) ?? null;
}

/**
 * Check if all tasks for a given pipeline step are DONE.
 */
async function allStepTasksDone(
  dealId: string,
  orgId: string,
  pipelineStep: number
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

  const completed = tasks.filter((t) => t.status === "DONE").length;
  if (tasks.length === 500) {
    const total = await prisma.task.count({ where });
    if (total > tasks.length) {
      return { done: false, total, completed };
    }
  }

  return { done: completed === tasks.length, total: tasks.length, completed };
}

function describeWorkflowAdvanceCriteria(
  currentStageName: string,
  nextStageName: string,
): string {
  return `All tasks for ${currentStageName} are complete and the deal is ready for review before moving into ${nextStageName}.`;
}

/**
 * #5 Stage Advancement: Suggest advancing to next stage when criteria are met.
 *
 * Triggered by: task.completed event (checks if all stage tasks are done)
 *
 * Actions:
 *   - When all tasks for current step are DONE → suggest advancement
 *   - ORIGINATION→SCREENING: Already handled by screen/triage flow (skip here)
 *   - DISPOSITION/CLOSED_*: not task-driven
 */
export async function handleAdvancement(
  event: AutomationEvent
): Promise<void> {
  // We listen to task.completed to detect when all step tasks are done
  if (event.type !== "task.completed") return;

  const { dealId, orgId } = event;

  const context = await getAutomationDealContext(dealId, orgId);
  if (!context) return;

  const currentStage = getCurrentWorkflowStage(context);
  const nextStage = getNextWorkflowStage(context);
  if (!currentStage || !nextStage) return;
  if (NON_TASK_DRIVEN_STAGE_KEYS.has(currentStage.key)) return;

  const pipelineStep = getWorkflowPipelineStep(context, currentStage.key);
  const stepStatus = await allStepTasksDone(dealId, orgId, pipelineStep);
  if (!stepStatus.done) return;

  const existingTask = await prisma.task.findFirst({
    where: {
      dealId,
      orgId,
      title: { contains: `advance to ${nextStage.name}` },
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
  });

  if (existingTask) return;

  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: `Deal ready to advance to ${nextStage.name}`,
    description: `All ${stepStatus.total} task(s) for workflow stage ${currentStage.name} are complete. Deal "${context.name}" may be ready to advance from ${currentStage.name} to ${nextStage.name}.\n\nCriteria: ${describeWorkflowAdvanceCriteria(currentStage.name, nextStage.name)}\n\nReview the completed tasks and move the deal forward only after human approval.`,
    pipelineStep,
  });
}

/**
 * Handle workflow stage changes by seeding the checklist for the new stage.
 */
export async function handleStatusChangeReminder(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "deal.stageChanged") return;

  const { dealId, orgId } = event;
  const context = await getAutomationDealContext(dealId, orgId);
  if (!context) return;

  const currentStage = getCurrentWorkflowStage(context);
  if (!currentStage) return;
  if (NON_TASK_DRIVEN_STAGE_KEYS.has(currentStage.key)) return;

  const pipelineStep = getWorkflowPipelineStep(context, currentStage.key);
  const tasksForStage = await prisma.task.count({
    where: { dealId, deal: { orgId }, pipelineStep },
  });

  if (tasksForStage === 0) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: `Create tasks for ${currentStage.name}`,
      description: `Deal advanced to workflow stage ${currentStage.name} but no tasks exist for pipeline step ${pipelineStep}. Create the operating checklist for ${currentStage.name} before the deal progresses further.`,
      pipelineStep,
    });
  }
}
