import { NextRequest } from "next/server";
import type { MapContextInput } from "@entitlement-os/shared";
import { runChatApplication } from "@gpc/server/chat/chat-application.service";
import { randomUUID } from "node:crypto";
import { executeAgentWorkflow } from "@/lib/agent/executeAgent";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import type { ResearchLaneSelection } from "@/lib/agent/researchRouting";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { sanitizeChatErrorMessage } from "./_lib/errorHandling";
import { createSseWriter, sseEvent } from "./sseWriter";
import * as Sentry from "@sentry/nextjs";
import "@/lib/automation/handlers"; // ensures learning promotion handler is registered

function toClientErrorPayload(message: string, correlationId: string): Record<string, unknown> {
  return {
    type: "error",
    ...sanitizeChatErrorMessage(message, correlationId),
  };
}

export async function POST(req: NextRequest) {
  type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";
  const requestedResearchLaneSelections = new Set<ResearchLaneSelection>([
    "auto",
    "local_first",
    "public_web",
    "interactive_browser",
  ]);

  let body: {
    message?: string;
    conversationId?: string;
    dealId?: string;
    intent?: string;
    mapContext?: MapContextInput | null;
    cuaModel?: CuaModelPreference;
    researchLane?: ResearchLaneSelection;
  };
  try {
    body = (await req.json()) as {
      message?: string;
      conversationId?: string;
      dealId?: string;
      intent?: string;
      mapContext?: MapContextInput | null;
      cuaModel?: CuaModelPreference;
      researchLane?: ResearchLaneSelection;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { conversationId: requestedConversationId, dealId, intent, mapContext } = body;
  const message = (body.message ?? "").trim();
  const preferredCuaModel =
    body.cuaModel === "gpt-5.4" || body.cuaModel === "gpt-5.4-mini"
      ? body.cuaModel
      : undefined;
  const researchLane =
    body.researchLane && requestedResearchLaneSelections.has(body.researchLane)
      ? body.researchLane
      : "auto";
  const correlationId =
    req.headers.get("x-request-id") ?? req.headers.get("idempotency-key") ?? randomUUID();

  if (!message || message.length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let auth;
  try {
    const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
    auth = authorization.ok ? authorization.auth : null;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.chat", method: "POST" },
    });
    console.error("[chat-route] resolveAuth error:", err);
    const errDetail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return Response.json(
      { error: "Authentication service unavailable", detail: errDetail },
      { status: 500 },
    );
  }
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appDatabaseUnavailableInDev = shouldUseAppDatabaseDevFallback();
  const effectiveConversationId = requestedConversationId ?? randomUUID();
  const encoder = new TextEncoder();
  let writer:
    | ReturnType<typeof createSseWriter>
    | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;
      writer = createSseWriter(controller, encoder);

      try {
        await runChatApplication({
          orgId: auth.orgId,
          userId: auth.userId,
          executeAgentWorkflow,
          message,
          requestedConversationId,
          effectiveConversationId,
          dealId: dealId ?? null,
          intent: intent ?? undefined,
          mapContext,
          correlationId,
          appDatabaseUnavailableInDev,
          preferredCuaModel,
          researchLane,
          onEvent: (event) => {
            if (event.type === "done") {
              doneSent = true;
            }
            if (event.type === "error") {
              console.error(`[chat-route][${correlationId}]`, event.message);
              writer?.enqueue(toClientErrorPayload(event.message, correlationId));
              return;
            }
            writer?.enqueue(event as Record<string, unknown>);
          },
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.chat", method: "POST" },
        });
        const errMsg = error instanceof Error ? error.message : "Agent execution failed";
        console.error(`[chat-route][${correlationId}]`, errMsg);
        writer?.enqueue(toClientErrorPayload(errMsg, correlationId));
      } finally {
        if (!doneSent) {
          writer?.enqueue({
            type: "done",
            runId: randomUUID(),
            status: "failed",
            conversationId: requestedConversationId,
          });
        }
        writer?.close();
      }
    },
    cancel() {
      writer?.markClosed();
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
