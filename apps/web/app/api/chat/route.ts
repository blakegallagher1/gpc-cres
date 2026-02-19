import { NextRequest } from "next/server";
import { setupAgentTracing } from "@entitlement-os/openai";
import { randomUUID } from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";
import { extractAndMergeConversationPreferences } from "@/lib/services/preferenceExtraction.service";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function isInternalFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("prisma") ||
    normalized.includes("findmany") ||
    normalized.includes("public.") ||
    normalized.includes("user_preferences") ||
    normalized.includes("the table")
  );
}

function isSystemConfigurationErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid schema for response_format") ||
    normalized.includes("response_format") ||
    normalized.includes("not a valid format") ||
    normalized.includes("json_schema") ||
    normalized.includes("outputtype")
  );
}

function isGuardrailTripwireMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("input guardrail triggered") ||
    normalized.includes("output guardrail triggered") ||
    normalized.includes("guardrail tripwire")
  );
}

function toClientErrorPayload(message: string, correlationId: string): Record<string, unknown> {
  if (!isGuardrailTripwireMessage(message)) {
    if (isInternalFailureMessage(message) || isSystemConfigurationErrorMessage(message)) {
      return {
        type: "error",
        code: "system_configuration_error",
        correlationId,
        message: "System configuration error. Please contact admin.",
      };
    }
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
  const correlationId =
    req.headers.get("x-request-id") ?? req.headers.get("idempotency-key") ?? randomUUID();

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
        const workflow = await runAgentWorkflow({
          orgId: auth.orgId,
          userId: auth.userId,
          conversationId: requestedConversationId ?? null,
          message,
          dealId: dealId ?? null,
          runType: "ENRICHMENT",
        maxTurns: 15,
        correlationId,
        persistConversation: true,
        onEvent: (event: AgentStreamEvent) => {
            if (event.type === "done") {
              doneSent = true;
            }
            if (event.type === "error") {
              console.error(`[chat-route][${correlationId}]`, event.message);
              controller.enqueue(
                encoder.encode(sseEvent(toClientErrorPayload(event.message, correlationId))),
              );
              return;
            }
            controller.enqueue(
              encoder.encode(sseEvent(event as Record<string, unknown>)),
            );
          },
        });

        if (workflow.conversationId) {
          void extractAndMergeConversationPreferences({
            orgId: auth.orgId,
            userId: auth.userId,
            conversationId: workflow.conversationId,
          }).catch((error) => {
            console.error(
              "[PreferenceExtraction] Failed:",
              error instanceof Error ? error.message : String(error),
            );
          });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Agent execution failed";
        console.error(`[chat-route][${correlationId}]`, errMsg);
        controller.enqueue(
          encoder.encode(sseEvent(toClientErrorPayload(errMsg, correlationId))),
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
