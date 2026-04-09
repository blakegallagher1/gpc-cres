import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { dispatchEvent } from "../automation/events";
import { captureAutomationDispatchError } from "../automation/sentry";
import type { ExecuteAgentWorkflow } from "../chat/agent-runtime-adapter";
import { runAgentWorkflow } from "../chat/run-agent-workflow.service";

const MAX_TASK_TURNS = 15;

function buildTaskPrompt(task: { title: string; description: string | null }, dealName: string) {
  const details = task.description ? `\n\nTask details: ${task.description}` : "";
  return [
    `Complete this task for deal ${dealName}.`,
    `Task: ${task.title}`,
    details,
    "",
    "Use available tools and data sources to answer as thoroughly as possible.",
    "Include explicit sources/evidence, key risks, and a clear conclusion.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface RunDealTaskAgentParams {
  orgId: string;
  userId: string;
  executeAgentWorkflow: ExecuteAgentWorkflow;
  dealId: string;
  taskId: string;
  correlationId?: string;
  onEvent?: (event: Record<string, unknown>) => void;
}

export interface RunDealTaskAgentResult {
  taskId: string;
  taskStatus: "DONE" | "FAILED";
  agentName: string;
}

export async function assertDealTaskAgentAccess(params: {
  orgId: string;
  dealId: string;
  taskId: string;
}): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: params.dealId, orgId: params.orgId },
    select: { id: true },
  });
  if (!deal) {
    throw new Error("Deal not found");
  }

  const task = await prisma.task.findFirst({
    where: { id: params.taskId, dealId: params.dealId },
    select: { id: true },
  });
  if (!task) {
    throw new Error("Task not found");
  }
}

export async function runDealTaskAgent(
  params: RunDealTaskAgentParams,
): Promise<RunDealTaskAgentResult> {
  const deal = await prisma.deal.findFirst({
    where: { id: params.dealId, orgId: params.orgId },
    select: { id: true, name: true },
  });
  if (!deal) {
    throw new Error("Deal not found");
  }

  const task = await prisma.task.findFirst({
    where: { id: params.taskId, dealId: params.dealId },
    select: { id: true, title: true, description: true, status: true },
  });
  if (!task) {
    throw new Error("Task not found");
  }

  await prisma.task.update({
    where: { id: params.taskId },
    data: { status: "IN_PROGRESS" },
  });

  let lastAgentName = "Coordinator";
  let fullText = "";

  try {
    const { result: workflowResult } = await runAgentWorkflow({
      orgId: params.orgId,
      userId: params.userId,
      executeAgentWorkflow: params.executeAgentWorkflow,
      correlationId: params.correlationId,
      message: buildTaskPrompt(task, deal.name),
      dealId: params.dealId,
      runType: "ENRICHMENT",
      maxTurns: MAX_TASK_TURNS,
      persistConversation: false,
      onEvent: (event) => {
        if (event.type === "agent_switch") {
          lastAgentName = event.agentName;
          params.onEvent?.({ type: "agent_switch", agentName: event.agentName });
          return;
        }

        if (event.type === "text_delta") {
          fullText += event.content;
          params.onEvent?.({ type: "text_delta", content: event.content });
          return;
        }

        if (event.type === "error") {
          params.onEvent?.({ type: "error", message: event.message });
          return;
        }

        if (event.type === "agent_summary") {
          params.onEvent?.(event);
        }
      },
    });

    if (workflowResult.status === "succeeded") {
      await prisma.task.update({
        where: { id: params.taskId },
        data: {
          status: "DONE",
          description: fullText
            ? `${task.description ?? ""}\n\n---\nAgent Findings (${lastAgentName}):\n${fullText}`.trim()
            : task.description,
        },
      });

      await dispatchEvent({
        type: "task.completed",
        dealId: params.dealId,
        taskId: params.taskId,
        orgId: params.orgId,
      }).catch((error) => {
        captureAutomationDispatchError(error, {
          handler: "deals.task-agent-run",
          eventType: "task.completed",
          dealId: params.dealId,
          orgId: params.orgId,
          status: "DONE",
        });
      });

      return {
        taskId: params.taskId,
        taskStatus: "DONE",
        agentName: lastAgentName,
      };
    }

    await prisma.task.update({
      where: { id: params.taskId },
      data: { status: "TODO" },
    });

    return {
      taskId: params.taskId,
      taskStatus: "FAILED",
      agentName: lastAgentName,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { service: "deals.task-agent-run" },
      extra: {
        dealId: params.dealId,
        taskId: params.taskId,
        orgId: params.orgId,
      },
    });

    await prisma.task.update({
      where: { id: params.taskId },
      data: { status: "TODO" },
    }).catch((updateError) => {
      Sentry.captureException(updateError, {
        tags: {
          service: "deals.task-agent-run",
          operation: "task-revert",
        },
        extra: {
          dealId: params.dealId,
          taskId: params.taskId,
          orgId: params.orgId,
        },
      });
    });

    throw error;
  }
}
