import { NextRequest } from "next/server";
import { setupAgentTracing } from "@entitlement-os/openai";
import { randomUUID } from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function isGuardrailTripwireMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("input guardrail triggered") ||
    normalized.includes("output guardrail triggered") ||
    normalized.includes("guardrail tripwire")
  );
}

function toGuardrailErrorPayload(message: string): Record<string, unknown> {
  if (!isGuardrailTripwireMessage(message)) {
    return { type: "error", message };
  }

  return {
    type: "error",
    code: "guardrail_tripwire",
    message:
      "Request blocked by safety guardrails. Please revise the prompt or remove risky/unvalidated content and try again.",
  };
}

export async function POST(req: NextRequest) {
  setupAgentTracing();

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
            if (event.type === "error") {
              controller.enqueue(
                encoder.encode(sseEvent(toGuardrailErrorPayload(event.message))),
              );
              return;
            }
            controller.enqueue(
              encoder.encode(sseEvent(event as Record<string, unknown>)),
            );
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Agent execution failed";
        controller.enqueue(
          encoder.encode(sseEvent(toGuardrailErrorPayload(errMsg))),
        );
      } finally {
        if (!doneSent) {
          controller.enqueue(
              encoder.encode(
              sseEvent({
                type: "done",
                runId: randomUUID(),
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
