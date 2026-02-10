import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import { canAutoAdvance } from "./gates";
import type { AutomationEvent } from "./events";
import type { DealStatus } from "@entitlement-os/shared";

/**
 * Ordered stage transitions. Each entry: [from, to, pipelineStep, criteria description].
 * pipelineStep = the step whose tasks must all be DONE before suggesting advancement.
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
  const tasks = await prisma.task.findMany({
    where: { dealId, deal: { orgId }, pipelineStep },
    select: { status: true },
  });

  if (tasks.length === 0) {
    return { done: false, total: 0, completed: 0 };
  }

  const completed = tasks.filter((t) => t.status === "DONE").length;
  return { done: completed === tasks.length, total: tasks.length, completed };
}

/**
 * #5 Stage Advancement: Suggest advancing to next stage when criteria are met.
 *
 * Triggered by: task.completed event (checks if all step tasks are done)
 * Also triggered by: deal.statusChanged event (for sending reminders)
 *
 * Actions:
 *   - When all tasks for current step are DONE → suggest advancement
 *   - INTAKE→TRIAGE_DONE: Already handled by triage route (skip here)
 *   - PREAPP+: Always human-gated — create notification, never auto-advance
 */
export async function handleAdvancement(
  event: AutomationEvent
): Promise<void> {
  // We listen to task.completed to detect when all step tasks are done
  if (event.type !== "task.completed") return;

  const { dealId, orgId } = event;

  // Load deal
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, name: true, status: true },
  });

  if (!deal) return;

  const status = deal.status as DealStatus;

  // INTAKE→TRIAGE_DONE handled by triage route, skip
  if (status === "INTAKE") return;

  // KILLED/EXITED — no advancement
  if (status === "KILLED" || status === "EXITED") return;

  // EXIT_MARKETED → EXITED is not task-driven (it's funds-received), skip
  if (status === "EXIT_MARKETED") return;

  const transition = getNextTransition(status);
  if (!transition) return;

  // Check if all tasks for this step are done
  const stepStatus = await allStepTasksDone(dealId, orgId, transition.pipelineStep);
  if (!stepStatus.done) return;

  // Check if we can auto-advance (only INTAKE→TRIAGE_DONE can auto-advance)
  const autoAdvanceAllowed = canAutoAdvance(status, transition.to);

  // Check if we already have a pending advancement notification
  const existingTask = await prisma.task.findFirst({
    where: {
      dealId,
      orgId,
      title: { contains: `advance to ${transition.to}` },
      status: { in: ["TODO", "IN_PROGRESS"] },
    },
  });

  if (existingTask) return;

  if (autoAdvanceAllowed) {
    // Only INTAKE→TRIAGE_DONE — but we skip INTAKE above, so this branch
    // is defensive. In practice, human gate always applies here.
    console.log(
      `[automation] Deal "${deal.name}" eligible for auto-advance from ${status} to ${transition.to}`
    );
    return;
  }

  // Human-gated: create notification task
  await createAutomationTask({
    orgId,
    dealId,
    type: "enrichment_review",
    title: `Deal ready to advance to ${transition.to}`,
    description: `All ${stepStatus.total} task(s) for Step ${transition.pipelineStep} are complete. Deal "${deal.name}" may be ready to advance from ${status} to ${transition.to}.\n\nCriteria: ${transition.criteriaDescription}\n\nReview the completed tasks and click "Advance" to proceed, or "Hold" if further work is needed.`,
    pipelineStep: transition.pipelineStep,
  });
}

/**
 * Handle deal.statusChanged — send reminders for stale deals.
 *
 * If a deal has been at the same status for > reminderAfterHours without
 * any task activity, create a reminder notification.
 */
export async function handleStatusChangeReminder(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "deal.statusChanged") return;

  const { dealId, to, orgId } = event;

  // Log the transition for audit
  console.log(
    `[automation] Deal ${dealId} advanced from ${event.from} to ${to}`
  );

  // If deal was killed, no further automation needed
  if (to === "KILLED") return;

  // After advancing, check if there are tasks for the new stage's pipeline step
  const transition = STAGE_TRANSITIONS.find((t) => t.from === to);
  if (!transition) return;

  const tasksForNextStep = await prisma.task.count({
    where: { dealId, deal: { orgId }, pipelineStep: transition.pipelineStep },
  });

  // If no tasks exist for the new stage, suggest creating them
  if (tasksForNextStep === 0) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "enrichment_review",
      title: `Create tasks for ${to} stage`,
      description: `Deal advanced to ${to} but no tasks exist for Step ${transition.pipelineStep}. Consider creating tasks for: ${transition.criteriaDescription}`,
      pipelineStep: transition.pipelineStep,
    });
  }
}
