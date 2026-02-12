import { NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import "@/lib/automation/handlers";

type TaskAgentStatus = "succeeded" | "failed" | "canceled";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, taskId } = await params;
  const { orgId, userId } = auth;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true, name: true },
  });
  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, dealId },
    select: { id: true, title: true, description: true, status: true },
  });
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS" },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;
      let lastAgentName = "Coordinator";
      let fullText = "";

      try {
        const { result: workflowResult } = await runAgentWorkflow({
          orgId,
          userId,
          message: buildTaskPrompt(task, deal.name),
          dealId,
          runType: "ENRICHMENT",
          maxTurns: MAX_TASK_TURNS,
          persistConversation: false,
          onEvent: (event) => {
            if (event.type === "agent_switch") {
              lastAgentName = event.agentName;
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "agent_switch", agentName: event.agentName }),
                ),
              );
              return;
            }

            if (event.type === "text_delta") {
              fullText += event.content;
              controller.enqueue(
                encoder.encode(sseEvent({ type: "text_delta", content: event.content })),
              );
              return;
            }

            if (event.type === "error") {
              controller.enqueue(
                encoder.encode(sseEvent({ type: "error", message: event.message })),
              );
              return;
            }

            if (event.type === "agent_summary") {
              controller.enqueue(
                encoder.encode(sseEvent(event)),
              );
              return;
            }

            if (event.type === "done") {
              doneSent = true;
              return;
            }
          },
        });

        if (workflowResult.status === "succeeded") {
          const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
              status: "DONE",
              description: fullText
                ? `${task.description ?? ""}\n\n---\nAgent Findings (${lastAgentName}):\n${fullText}`.trim()
                : task.description,
            },
          });

          await dispatchEvent({
            type: "task.completed",
            dealId,
            taskId,
            orgId,
          }).catch(() => {});

          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "done",
                taskId: updatedTask.id,
                taskStatus: "DONE",
                agentName: lastAgentName,
              }),
            ),
          );
          return;
        }

        // Revert to TODO when task execution was interrupted or failed.
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "TODO" },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Task execution failed";
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: errMsg })));
        await prisma.task.update({ where: { id: taskId }, data: { status: "TODO" } }).catch(() => {});
      } finally {
        if (!doneSent) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "done",
                taskId,
                taskStatus: "FAILED",
                agentName: lastAgentName,
              }),
            ),
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
