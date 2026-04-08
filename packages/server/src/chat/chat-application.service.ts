import type { MapContextInput, StructuredParcelContext } from "@entitlement-os/shared";
import { setupAgentTracing } from "@entitlement-os/openai";
import {
  ParcelQueryExecutor,
  ParcelQueryPlanner,
  ParcelSetRegistry,
} from "@entitlement-os/openai/planning";
import { runAgentWorkflow, isDatabaseConnectivityError } from "./run-agent-workflow.service";
import type { AgentStreamEvent } from "../../../../apps/web/lib/agent/executeAgent";
import type { ResearchLaneSelection } from "../../../../apps/web/lib/agent/researchRouting";
import { extractAndMergeConversationPreferences } from "../services/preference-extraction.service";
import {
  getPropertyDbScopeHeaders,
  type PropertyDbGatewayScope,
} from "../search/property-db-rpc.service";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

export type ChatRouteStatusEvent =
  | AgentStreamEvent
  | {
      type: "status";
      status: string;
      message: string;
      debug?: string;
    };

export interface RunChatApplicationParams {
  orgId: string;
  userId: string;
  message: string;
  requestedConversationId?: string | null;
  effectiveConversationId: string;
  dealId?: string | null;
  intent?: string;
  mapContext?: MapContextInput | null;
  correlationId: string;
  appDatabaseUnavailableInDev: boolean;
  preferredCuaModel?: CuaModelPreference;
  researchLane: ResearchLaneSelection;
  onEvent?: (event: ChatRouteStatusEvent) => void;
}

function buildGatewayHeaders(
  gatewayKey: string,
  scope: PropertyDbGatewayScope,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${gatewayKey}`,
    apikey: gatewayKey,
    "Content-Type": "application/json",
    ...getPropertyDbScopeHeaders(scope),
  };

  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    headers["CF-Access-Client-Id"] = clientId;
    headers["CF-Access-Client-Secret"] = clientSecret;
  }

  return headers;
}

class GatewayAdapterForChatRoute {
  constructor(private gatewayUrl?: string, private gatewayKey?: string) {}

  async searchParcelsByBbox(query: { bounds: [number, number, number, number]; limit?: number }) {
    if (!this.gatewayUrl || !this.gatewayKey) {
      return [];
    }
    const gatewayHeaders = buildGatewayHeaders(this.gatewayKey, "map.read");
    const [west, south, east, north] = query.bounds;
    const res = await fetch(`${this.gatewayUrl}/tools/parcel.bbox`, {
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
    const gatewayHeaders = buildGatewayHeaders(this.gatewayKey, "map.read");
    const promises = parcelIds.map((id) =>
      fetch(`${this.gatewayUrl}/tools/parcel.lookup`, {
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

  async screenParcels() {
    return [];
  }
}

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
    if (!mapContext || !message) {
      return {
        structured: null,
        fallbackPrefix: buildMapContextPrefix(mapContext),
      };
    }

    const registry = new ParcelSetRegistry();
    const planner = new ParcelQueryPlanner();
    const executor = new ParcelQueryExecutor(
      new GatewayAdapterForChatRoute(process.env.LOCAL_API_URL, process.env.LOCAL_API_KEY),
    );

    const plan = planner.plan({
      message,
      orgId,
      mapContext,
      registry,
      conversationId,
    });

    const executionResult = await executor.execute(plan, registry, conversationId);
    const structured: StructuredParcelContext = {
      plan,
      sets: executionResult.sets.map((ms) => {
        let analytics = null;
        if (ms.materialization) {
          analytics = {
            totalCount: ms.materialization.count,
            distributions: {},
            screeningSummary: null,
            topConstraints: [],
            scoringSummary: null,
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

    return { structured, fallbackPrefix: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[chat-service] ParcelContext planning failed, using fallback prefix:", message);
    return {
      structured: null,
      fallbackPrefix: buildMapContextPrefix(mapContext),
    };
  }
}

export async function runChatApplication(
  params: RunChatApplicationParams,
) {
  setupAgentTracing();

  if (params.mapContext) {
    params.onEvent?.({
      type: "status",
      status: "planning",
      message: "Analyzing map context...",
    });
  }

  const { structured, fallbackPrefix } = await buildParcelContext(
    params.mapContext,
    params.message,
    params.orgId,
    params.effectiveConversationId,
  );

  const contextMessage = structured
    ? `${JSON.stringify(structured)}\n\n${params.message}`
    : `${fallbackPrefix}${params.message}`;

  if (params.appDatabaseUnavailableInDev) {
    params.onEvent?.({
      type: "status",
      status: "degraded_mode",
      message:
        "Running without chat persistence because the app database is unavailable in local development.",
    });
  }

  const workflowArgs = {
    orgId: params.orgId,
    userId: params.userId,
    conversationId: params.appDatabaseUnavailableInDev
      ? null
      : params.requestedConversationId ?? null,
    message: contextMessage,
    dealId: params.appDatabaseUnavailableInDev ? null : params.dealId ?? null,
    runType: "ENRICHMENT" as const,
    maxTurns: 15,
    correlationId: params.correlationId,
    persistConversation: !params.appDatabaseUnavailableInDev,
    intent: params.intent ?? undefined,
    preferredCuaModel: params.preferredCuaModel,
    researchLane: params.researchLane,
    ephemeralMode: params.appDatabaseUnavailableInDev,
    onEvent: (event: AgentStreamEvent) => {
      params.onEvent?.(event);
    },
  };

  let workflow;
  try {
    workflow = await runAgentWorkflow(workflowArgs);
  } catch (workflowError) {
    if (params.appDatabaseUnavailableInDev || !isDatabaseConnectivityError(workflowError)) {
      throw workflowError;
    }
    const dbErrMsg = workflowError instanceof Error ? workflowError.message : String(workflowError);
    console.warn(
      `[chat-service][${params.correlationId}] app DB unavailable; retrying in ephemeral mode. Error: ${dbErrMsg}`,
    );
    params.onEvent?.({
      type: "status",
      status: "degraded_mode",
      message: "Running without chat persistence while database connectivity recovers.",
      debug: dbErrMsg,
    });
    workflow = await runAgentWorkflow({
      ...workflowArgs,
      persistConversation: false,
      conversationId: null,
      dealId: null,
      ephemeralMode: true,
      preferredCuaModel: params.preferredCuaModel,
      researchLane: params.researchLane,
    });
  }

  if (workflow.conversationId) {
    void extractAndMergeConversationPreferences({
      orgId: params.orgId,
      userId: params.userId,
      conversationId: workflow.conversationId,
    }).catch((error) => {
      console.error(
        "[PreferenceExtraction] Failed:",
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  return workflow;
}
