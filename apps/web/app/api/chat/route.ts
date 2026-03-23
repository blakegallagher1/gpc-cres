import { NextRequest } from "next/server";
import type { MapContextInput, StructuredParcelContext } from "@entitlement-os/shared";
import { setupAgentTracing } from "@entitlement-os/openai";
import {
  ParcelQueryPlanner,
  ParcelQueryExecutor,
  ParcelSetRegistry,
} from "@entitlement-os/openai/planning";
import { randomUUID } from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";
import { extractAndMergeConversationPreferences } from "@/lib/services/preferenceExtraction.service";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { sanitizeChatErrorMessage } from "./_lib/errorHandling";
import { createSseWriter, sseEvent } from "./sseWriter";
import * as Sentry from "@sentry/nextjs";

/**
 * Simple GatewayAdapter for chat route — delegates to LOCAL_API_URL
 */
class GatewayAdapterForChatRoute {
  constructor(private gatewayUrl?: string, private gatewayKey?: string) {}

  async searchParcelsByBbox(query: { bounds: [number, number, number, number]; limit?: number }) {
    if (!this.gatewayUrl || !this.gatewayKey) {
      return [];
    }
    const [west, south, east, north] = query.bounds;
    const res = await fetch(`${this.gatewayUrl}/tools/parcel.bbox`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.gatewayKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        west,
        south,
        east,
        north,
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.parcels ?? data.data ?? [];
  }

  async getParcelDetails(parcelIds: string[]) {
    if (!this.gatewayUrl || !this.gatewayKey) {
      return [];
    }
    const promises = parcelIds.map((id) =>
      fetch(`${this.gatewayUrl}/tools/parcel.lookup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parcel_id: id }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    );
    const results = await Promise.all(promises);
    return results.filter((r) => r !== null);
  }

  async screenParcels(parcelIds: string[], dimensions: string[]) {
    // Non-critical: screening is optional on first turn
    return [];
  }
}

/**
 * Build StructuredParcelContext by planning and executing parcel query
 * Fallback to text prefix if planning fails (non-fatal)
 */
async function buildParcelContext(
  mapContext: MapContextInput | null | undefined,
  message: string,
  orgId: string,
  conversationId: string,
): Promise<{
  structured: StructuredParcelContext | null;
  fallbackPrefix: string;
}> {
  try {
    // Only plan if we have map context and a non-empty message
    if (!mapContext || !message) {
      return {
        structured: null,
        fallbackPrefix: buildMapContextPrefix(mapContext),
      };
    }

    // Create registry + planner per-conversation
    const registry = new ParcelSetRegistry();
    const planner = new ParcelQueryPlanner();
    const executor = new ParcelQueryExecutor(
      new GatewayAdapterForChatRoute(process.env.LOCAL_API_URL, process.env.LOCAL_API_KEY),
    );

    // Plan the query
    const plan = planner.plan({
      message,
      orgId,
      mapContext,
      registry,
      conversationId,
    });

    // Execute the plan
    const executionResult = await executor.execute(plan, registry, conversationId);

    // Build StructuredParcelContext from execution result
    const structured: StructuredParcelContext = {
      plan,
      sets: executionResult.sets.map((ms) => {
        let analytics = null;
        if (ms.materialization) {
          // Build SetAnalytics from materialization data
          // For initial implementation, use minimal but complete structure
          analytics = {
            totalCount: ms.materialization.count,
            distributions: {}, // Can be enriched with zoning, parish, etc. in future
            screeningSummary: null, // Derived from screening results if needed
            topConstraints: [], // Most impactful constraints if needed
            scoringSummary: null, // Can be computed from facts if needed
          };
        }
        return {
          definition: ms.definition,
          materialization: ms.materialization,
          analytics,
        };
      }),
      conversationSetRegistry: registry.listSetIds(conversationId),
      intent: plan.intent,
      outputMode: plan.outputMode,
    };

    return {
      structured,
      fallbackPrefix: "", // If structured context succeeded, don't need fallback
    };
  } catch (err) {
    // Non-fatal: planning failed, use text prefix fallback
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[chat-route] ParcelContext planning failed, using fallback prefix:", message);
    return {
      structured: null,
      fallbackPrefix: buildMapContextPrefix(mapContext),
    };
  }
}

/**
 * Legacy text-based map context (fallback)
 */
function buildMapContextPrefix(mapContext: MapContextInput | null | undefined): string {
  const center = mapContext?.center;
  const selected = mapContext?.selectedParcelIds ?? [];
  const selectedParcels = mapContext?.selectedParcels ?? [];
  const viewportBounds = mapContext?.viewportBounds;
  const spatialSelection = mapContext?.spatialSelection;
  const referenced = mapContext?.referencedFeatures ?? [];
  const hasContext =
    Boolean(center) ||
    typeof mapContext?.zoom === "number" ||
    Boolean(viewportBounds) ||
    selected.length > 0 ||
    selectedParcels.length > 0 ||
    referenced.length > 0 ||
    Boolean(spatialSelection) ||
    Boolean(mapContext?.viewportLabel);

  if (!hasContext) {
    return "";
  }

  const referencedText =
    referenced.length > 0
      ? referenced
          .map((feature) =>
            [
              feature.parcelId,
              feature.label,
              feature.address,
              feature.zoning,
              feature.acres ? `${feature.acres} acres` : null,
            ]
              .filter((value) => typeof value === "string" && value.length > 0)
              .join(" | "),
          )
          .join("; ")
      : "none";

  const selectedText =
    selectedParcels.length > 0
      ? selectedParcels
          .map((feature) =>
            [feature.parcelId, feature.address, feature.zoning]
              .filter((value) => typeof value === "string" && value.length > 0)
              .join(" | "),
          )
          .join("; ")
      : "none";

  const boundsText = viewportBounds
    ? `${viewportBounds.west},${viewportBounds.south},${viewportBounds.east},${viewportBounds.north}`
    : "unknown";

  const spatialText = spatialSelection
    ? `kind=${spatialSelection.kind}; parcelIds=${
        spatialSelection.parcelIds?.length ? spatialSelection.parcelIds.join(",") : "none"
      }; label=${spatialSelection.label ?? "unknown"}`
    : "none";

  return `[Map Context]\ncenter=${center ? `${center.lat},${center.lng}` : "unknown"}\nzoom=${
    typeof mapContext?.zoom === "number" ? mapContext.zoom.toFixed(2) : "unknown"
  }\nselectedParcelIds=${selected.length > 0 ? selected.join(",") : "none"}\nviewportLabel=${
    mapContext?.viewportLabel ?? "unknown"
  }\nviewportBounds=${boundsText}\nselectedParcels=${selectedText}\nspatialSelection=${spatialText}\nreferencedFeatures=${referencedText}\n[/Map Context]\n\n`;
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
        // Build structured parcel context from planner/executor, with fallback to text prefix
        const { structured, fallbackPrefix } = await buildParcelContext(
          mapContext,
          message,
          auth.orgId,
          requestedConversationId ?? randomUUID(),
        );

        // Construct message: structured context or fallback prefix + user message
        const contextMessage = structured
          ? `${JSON.stringify(structured, null, 2)}\n\n${message}`
          : `${fallbackPrefix}${message}`;

        const workflow = await runAgentWorkflow({
          orgId: auth.orgId,
          userId: auth.userId,
          conversationId: requestedConversationId ?? null,
          message: contextMessage,
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
