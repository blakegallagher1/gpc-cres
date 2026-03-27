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
import { isDatabaseConnectivityError, runAgentWorkflow } from "@/lib/agent/agentRunner";
import type { AgentStreamEvent } from "@/lib/agent/executeAgent";
import { extractAndMergeConversationPreferences } from "@/lib/services/preferenceExtraction.service";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { sanitizeChatErrorMessage } from "./_lib/errorHandling";
import { createSseWriter, sseEvent } from "./sseWriter";
import * as Sentry from "@sentry/nextjs";
import "@/lib/automation/handlers"; // ensures learning promotion handler is registered
import { buildGatewayHeaders } from "./gatewayHeaders";

/**
 * Simple GatewayAdapter for chat route — delegates to LOCAL_API_URL
 */
class GatewayAdapterForChatRoute {
  constructor(private gatewayUrl?: string, private gatewayKey?: string) {}

  async searchParcelsByBbox(query: { bounds: [number, number, number, number]; limit?: number }) {
    if (!this.gatewayUrl || !this.gatewayKey) {
      return [];
    }
    const gatewayUrl = this.gatewayUrl;
    const gatewayHeaders = buildGatewayHeaders(this.gatewayKey);
    const [west, south, east, north] = query.bounds;
    const res = await fetch(`${gatewayUrl}/tools/parcel.bbox`, {
      method: "POST",
      headers: gatewayHeaders,
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
    const gatewayUrl = this.gatewayUrl;
    const gatewayHeaders = buildGatewayHeaders(this.gatewayKey);
    const promises = parcelIds.map((id) =>
      fetch(`${gatewayUrl}/tools/parcel.lookup`, {
        method: "POST",
        headers: gatewayHeaders,
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

  type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

  let body: {
    message?: string;
    conversationId?: string;
    dealId?: string;
    intent?: string;
    mapContext?: MapContextInput | null;
    cuaModel?: CuaModelPreference;
  };
  try {
    body = (await req.json()) as {
      message?: string;
      conversationId?: string;
      dealId?: string;
      intent?: string;
      mapContext?: MapContextInput | null;
      cuaModel?: CuaModelPreference;
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
        // Emit a thinking event immediately so the client sees TTFB while we plan
        if (mapContext) {
          writer.enqueue({ type: "status", status: "planning", message: "Analyzing map context..." });
        }

        // Build structured parcel context — may make 1-3 gateway calls (600-2300ms)
        const { structured, fallbackPrefix } = await buildParcelContext(
          mapContext,
          message,
          auth.orgId,
          effectiveConversationId,
        );
        const contextMessage = structured
          ? `${JSON.stringify(structured)}\n\n${message}`
          : `${fallbackPrefix}${message}`;

        if (appDatabaseUnavailableInDev) {
          writer.enqueue({
            type: "status",
            status: "degraded_mode",
            message: "Running without chat persistence because the app database is unavailable in local development.",
          });
        }

        const workflowArgs = {
          orgId: auth.orgId,
          userId: auth.userId,
          conversationId: appDatabaseUnavailableInDev ? null : requestedConversationId ?? null,
          message: contextMessage,
          dealId: appDatabaseUnavailableInDev ? null : dealId ?? null,
          runType: "ENRICHMENT" as const,
          maxTurns: 15,
          correlationId,
          persistConversation: !appDatabaseUnavailableInDev,
          intent: intent ?? undefined,
          preferredCuaModel,
          ephemeralMode: appDatabaseUnavailableInDev,
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
        };
        let workflow;
        try {
          workflow = await runAgentWorkflow(workflowArgs);
        } catch (workflowError) {
          if (appDatabaseUnavailableInDev || !isDatabaseConnectivityError(workflowError)) {
            throw workflowError;
          }
          const dbErrMsg = workflowError instanceof Error ? workflowError.message : String(workflowError);
          console.warn(
            `[chat-route][${correlationId}] app DB unavailable; retrying in ephemeral mode. Error: ${dbErrMsg}`,
          );
          writer.enqueue({
            type: "status",
            status: "degraded_mode",
            message: `Running without chat persistence while database connectivity recovers.`,
            debug: dbErrMsg,
          });
          workflow = await runAgentWorkflow({
            ...workflowArgs,
            persistConversation: false,
            conversationId: null,
            dealId: null,
            ephemeralMode: true,
            preferredCuaModel,
          });
        }

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
