import { NextRequest } from "next/server";
import type { MapContextInput } from "@entitlement-os/shared";
import { setupAgentTracing } from "@entitlement-os/openai";
import { randomUUID } from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";
import { extractAndMergeConversationPreferences } from "@/lib/services/preferenceExtraction.service";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { sanitizeChatErrorMessage } from "./_lib/errorHandling";
import { createSseWriter, sseEvent } from "./sseWriter";
import * as Sentry from "@sentry/nextjs";

function buildMapContextPrefix(mapContext: MapContextInput | null | undefined): string {
  const center = mapContext?.center;
  const selected = mapContext?.selectedParcelIds ?? [];
  const referenced = mapContext?.referencedFeatures ?? [];
  const hasContext =
    Boolean(center) ||
    typeof mapContext?.zoom === "number" ||
    selected.length > 0 ||
    referenced.length > 0 ||
    Boolean(mapContext?.viewportLabel);

  if (!hasContext) {
    return "";
  }

  const referencedText =
    referenced.length > 0
      ? referenced
          .map((feature) =>
            [feature.parcelId, feature.address, feature.zoning]
              .filter((value) => typeof value === "string" && value.length > 0)
              .join(" | "),
          )
          .join("; ")
      : "none";

  return `[Map Context]\ncenter=${center ? `${center.lat},${center.lng}` : "unknown"}\nzoom=${
    typeof mapContext?.zoom === "number" ? mapContext.zoom.toFixed(2) : "unknown"
  }\nselectedParcelIds=${selected.length > 0 ? selected.join(",") : "none"}\nviewportLabel=${
    mapContext?.viewportLabel ?? "unknown"
  }\nreferencedFeatures=${referencedText}\n[/Map Context]\n\n`;
}

function toClientErrorPayload(message: string, correlationId: string): Record<string, unknown> {
  return {
    type: "error",
    ...sanitizeChatErrorMessage(message, correlationId),
  };
}

export async function POST(req: NextRequest) {
  setupAgentTracing();

  let body: {
    message?: string;
    conversationId?: string;
    dealId?: string;
    intent?: string;
    mapContext?: MapContextInput | null;
  };
  try {
    body = (await req.json()) as {
      message?: string;
      conversationId?: string;
      dealId?: string;
      intent?: string;
      mapContext?: MapContextInput | null;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { conversationId: requestedConversationId, dealId, intent, mapContext } = body;
  const message = (body.message ?? "").trim();
  const correlationId =
    req.headers.get("x-request-id") ?? req.headers.get("idempotency-key") ?? randomUUID();

  if (!message || message.length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let auth;
  try {
    auth = await resolveAuth(req);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.chat", method: "POST" },
    });
    console.error("[chat-route] resolveAuth error:", err);
    return Response.json(
      { error: "Authentication service unavailable" },
      { status: 500 },
    );
  }
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (shouldUseAppDatabaseDevFallback()) {
    const errorPayload = toClientErrorPayload(
      "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      correlationId,
    );
    return new Response(
      `${sseEvent(errorPayload)}${sseEvent({
        type: "done",
        runId: randomUUID(),
        status: "failed",
        conversationId: requestedConversationId ?? null,
      })}`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  const encoder = new TextEncoder();
  let writer:
    | ReturnType<typeof createSseWriter>
    | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      let doneSent = false;
      writer = createSseWriter(controller, encoder);

      try {
        const mapContextPrefix = buildMapContextPrefix(mapContext);

        const workflow = await runAgentWorkflow({
          orgId: auth.orgId,
          userId: auth.userId,
          conversationId: requestedConversationId ?? null,
          message: `${mapContextPrefix}${message}`,
          dealId: dealId ?? null,
          runType: "ENRICHMENT",
          maxTurns: 15,
          correlationId,
          persistConversation: true,
          intent: intent ?? undefined,
          onEvent: (event: AgentStreamEvent) => {
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
