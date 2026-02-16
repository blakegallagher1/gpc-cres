import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentInputMessage } from "@/lib/agent/executeAgent";

type AgentApiPayload = {
  message?: string;
  input?: unknown;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  runType?: string;
  maxTurns?: unknown;
  persistConversation?: boolean;
  injectSystemContext?: boolean;
};

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function parseInputPayload(input: unknown): AgentInputMessage[] | null {
  if (!Array.isArray(input)) return null;
  const parsed: AgentInputMessage[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const role = item["role"];
    if (role !== "user" && role !== "assistant") return null;
    const content = item["content"];

    if (role === "user") {
      if (typeof content !== "string") return null;
      parsed.push({ role: "user", content });
      continue;
    }

    if (
      typeof content === "object" &&
      Array.isArray(content) &&
      (content as Array<unknown>).every(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as Record<string, unknown>).type === "output_text" &&
          typeof (part as Record<string, unknown>).text === "string",
      )
    ) {
      parsed.push({
        role: "assistant",
        status: "completed",
        content: content as Array<{ type: "output_text"; text: string }>,
      });
      continue;
    }

    return null;
  }

  return parsed;
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AgentApiPayload;
  try {
    body = (await req.json()) as AgentApiPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const input = parseInputPayload(body.input);
  if (!message && !(input && input.length > 0)) {
    return Response.json(
      { error: "Either 'message' or 'input' is required." },
      { status: 400 },
    );
  }

  const maxTurns =
    typeof body.maxTurns === "number" && Number.isInteger(body.maxTurns)
      ? body.maxTurns
      : undefined;
  const correlationId = req.headers.get("x-request-id") ?? req.headers.get("idempotency-key");

  const runInput = {
    orgId: auth.orgId,
    userId: auth.userId,
    conversationId: body.conversationId ?? null,
    message: message || undefined,
    input: input ?? undefined,
    dealId: body.dealId ?? null,
    jurisdictionId: body.jurisdictionId ?? null,
    sku: body.sku ?? null,
    runType: body.runType,
    maxTurns,
    correlationId: correlationId ?? undefined,
    persistConversation: body.persistConversation ?? true,
    injectSystemContext: body.injectSystemContext ?? true,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;

      try {
        await runAgentWorkflow({
          ...runInput,
          onEvent: (event) => {
            if (event.type === "done") {
              doneSent = true;
            }
            controller.enqueue(encoder.encode(sseEvent(event as Record<string, unknown>)));
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Agent execution failed";
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message: errMsg })),
        );
      } finally {
        if (!doneSent) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "done",
                runId: randomUUID(),
                status: "failed",
                conversationId: runInput.conversationId ?? null,
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
