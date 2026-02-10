import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { isAgentExecutable, getHumanOnlyReason } from "./taskAllowlist";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";

/**
 * #4 Task Execution: Detect agent-executable tasks and flag them for auto-run.
 *
 * Triggered by: task.created event
 * Checks:
 *   1. Task status is TODO
 *   2. Task is agent-executable (passes allowlist check)
 *   3. Concurrent limit per deal not exceeded
 *
 * When conditions met: logs the task as auto-runnable.
 * When task is human-only: adds a descriptive note to the task.
 */
export async function handleTaskCreated(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "task.created") return;

  const { taskId, dealId, orgId } = event;

  // Load the task
  const task = await prisma.task.findFirst({
    where: { id: taskId, dealId, deal: { orgId } },
  });

  if (!task) return;
  if (task.status !== "TODO") return;

  // Skip [AUTO] tasks (they are notifications, not executable work)
  if (task.title.startsWith("[AUTO]")) return;

  // Check if agent-executable
  const humanReason = getHumanOnlyReason(task.title);
  if (humanReason) {
    // Log but don't create a task for human-only tasks — they're already human tasks
    console.log(
      `[automation] Task "${task.title}" is human-only: ${humanReason}`
    );
    return;
  }

  // Check concurrent task limit per deal
  const inProgressCount = await prisma.task.count({
    where: {
      dealId,
      status: "IN_PROGRESS",
      deal: { orgId },
    },
  });

  if (
    inProgressCount >= AUTOMATION_CONFIG.taskExecution.maxConcurrentPerDeal
  ) {
    console.log(
      `[automation] Concurrent task limit (${AUTOMATION_CONFIG.taskExecution.maxConcurrentPerDeal}) reached for deal ${dealId}. Task "${task.title}" queued.`
    );
    return;
  }

  // Task is agent-executable and under concurrent limit
  console.log(
    `[automation] Task "${task.title}" is agent-executable. Ready for auto-run.`
  );
}

/**
 * Handle task.completed event — check for quality and cascading tasks.
 *
 * When a task completes:
 *   1. Check output quality (minimum length)
 *   2. If output too short, flag for review
 */
export async function handleTaskCompleted(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "task.completed") return;

  const { taskId, dealId, orgId } = event;

  const task = await prisma.task.findFirst({
    where: { id: taskId, dealId, deal: { orgId } },
  });

  if (!task) return;

  // Check output quality if task was marked DONE
  if (task.status === "DONE" && task.description) {
    // Find agent findings section
    const findingsIdx = task.description.indexOf("Agent Findings");
    if (findingsIdx >= 0) {
      const findings = task.description.slice(findingsIdx);
      if (
        findings.length < AUTOMATION_CONFIG.taskExecution.minOutputLength
      ) {
        // Low-quality output — flag for review
        await createAutomationTask({
          orgId,
          dealId,
          type: "enrichment_review",
          title: `Review agent output for "${task.title}"`,
          description: `Agent output for task "${task.title}" is below minimum quality threshold (${findings.length} chars < ${AUTOMATION_CONFIG.taskExecution.minOutputLength} minimum). Please review the results.`,
          pipelineStep: task.pipelineStep ?? 1,
        });
      }
    }
  }
}
