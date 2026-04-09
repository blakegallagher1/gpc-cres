import { NextRequest } from "next/server";
import { executeAgentWorkflow } from "@/lib/agent/executeAgent";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";
import "@/lib/automation/handlers";
import {
  assertDealTaskAgentAccess,
  runDealTaskAgent,
} from "@gpc/server/deals/task-agent-run.service";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, taskId } = await params;
  const { orgId, userId } = auth;

  try {
    await assertDealTaskAgentAccess({ orgId, dealId, taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Task not found" ? 404 : 404;
    return Response.json({ error: message }, { status });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;
      let lastAgentName = "Coordinator";
      let fullText = "";

      try {
        const result = await runDealTaskAgent({
          orgId,
          userId,
          executeAgentWorkflow,
          dealId,
          taskId,
          correlationId:
            request.headers.get("x-request-id") ??
            request.headers.get("idempotency-key") ??
            undefined,
          onEvent: (event) => {
            if (event.type === "agent_switch") {
              lastAgentName = String(event.agentName);
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "agent_switch", agentName: event.agentName }),
                ),
              );
              return;
            }

            if (event.type === "text_delta") {
              const content = String(event.content ?? "");
              fullText += content;
              controller.enqueue(
                encoder.encode(sseEvent({ type: "text_delta", content })),
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
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "done",
              taskId: result.taskId,
              taskStatus: result.taskStatus,
              agentName: result.agentName,
            }),
          ),
        );
        doneSent = true;
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.deals.tasks.run", method: "POST" },
        });
        const errMsg = error instanceof Error ? error.message : "Task execution failed";
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: errMsg })));
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
