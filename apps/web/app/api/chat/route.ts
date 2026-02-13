import { NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: { message?: string; conversationId?: string; dealId?: string };
  try {
    body = (await req.json()) as {
      message?: string;
      conversationId?: string;
      dealId?: string;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { conversationId: requestedConversationId, dealId } = body;
  const message = (body.message ?? "").trim();
  const correlationId = req.headers.get("x-request-id") ?? req.headers.get("idempotency-key");

  if (!message || message.length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;

      try {
        await runAgentWorkflow({
          orgId: auth.orgId,
          userId: auth.userId,
          conversationId: requestedConversationId ?? null,
          message,
          dealId: dealId ?? null,
          runType: "ENRICHMENT",
        maxTurns: 15,
        correlationId: correlationId ?? undefined,
        persistConversation: true,
        onEvent: (event: AgentStreamEvent) => {
            if (event.type === "done") {
              doneSent = true;
            }
            controller.enqueue(encoder.encode(sseEvent(event as Record<string, unknown>)));
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Agent execution failed";
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: errMsg })));
      } finally {
        if (!doneSent) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "done",
                runId: "agent-run-failed",
                status: "failed",
                conversationId: requestedConversationId,
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
