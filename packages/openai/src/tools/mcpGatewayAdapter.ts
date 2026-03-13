/**
 * MCP Gateway Adapter — routes eligible gateway-like tools through MCP
 * when OPENAI_MCP_GATEWAY_ENABLED=true. Falls back to direct gateway routing
 * when disabled.
 *
 * This module does NOT replace existing gateway routing — it provides an
 * alternative transport layer using the OpenAI MCP connector pattern.
 */

import {
  TOOL_CATALOG,
  resolveToolCatalogEntry,
  type ToolCatalogEntry,
} from "./toolCatalog.js";

const GOOGLE_MAPS_MCP_SERVER_URL = "https://mapstools.googleapis.com/mcp";
const GOOGLE_MAPS_MCP_REMOTE_TOOL_NAMES: Record<string, string> = {
  gmaps_search_places: "search_places",
  gmaps_compute_routes: "compute_routes",
  gmaps_lookup_weather: "lookup_weather",
};

const MCP_ALLOWLISTED_SERVERS = new Set([
  "https://api.gallagherpropco.com",
  GOOGLE_MAPS_MCP_SERVER_URL,
]);

export function isMcpGatewayEnabled(): boolean {
  return process.env.OPENAI_MCP_GATEWAY_ENABLED === "true";
}

export function isGoogleMapsGroundingLiteEnabled(): boolean {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return (
    process.env.GOOGLE_MAPS_GROUNDING_LITE_ENABLED === "true" &&
    Boolean(apiKey)
  );
}

export type McpToolDefinition = {
  type: "mcp";
  server_label: string;
  server_url: string;
  require_approval: "never";
  headers?: Record<string, string>;
  allowed_tools?: string[];
  server_description?: string;
};

function getGoogleMapsAllowedRemoteTools(intent?: string): string[] {
  return Object.values(TOOL_CATALOG)
    .filter((entry) => entry.destination === "mcp")
    .filter((entry) => !intent || entry.intents.includes(intent))
    .map((entry) => GOOGLE_MAPS_MCP_REMOTE_TOOL_NAMES[entry.name])
    .filter((toolName): toolName is string => Boolean(toolName));
}

/**
 * Get tools that are eligible for MCP routing.
 * Returns catalog entries for tools that can be served via MCP.
 */
export function getMcpEligibleTools(intent?: string): ToolCatalogEntry[] {
  return Object.values(TOOL_CATALOG).filter((entry) => {
    if (intent && !entry.intents.includes(intent)) {
      return false;
    }

    if (entry.destination === "gateway") {
      return isMcpGatewayEnabled();
    }

    if (entry.destination === "mcp") {
      return isGoogleMapsGroundingLiteEnabled();
    }

    return false;
  });
}

/**
 * Build an MCP server tool definition for the Responses API.
 * This returns the tool configuration that tells OpenAI to proxy
 * the tool call through the MCP server.
 *
 * See: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
 */
export function buildMcpServerTool(
  serverUrl: string,
  options?: {
    serverLabel?: string;
    headers?: Record<string, string>;
    allowedTools?: string[];
    serverDescription?: string;
  },
): McpToolDefinition | null {
  if (!isMcpGatewayEnabled()) return null;
  if (!MCP_ALLOWLISTED_SERVERS.has(serverUrl)) {
    console.warn(`[mcp] Server URL not in allowlist: ${serverUrl}`);
    return null;
  }

  return {
    type: "mcp" as const,
    server_label: options?.serverLabel ?? "gateway",
    server_url: serverUrl,
    require_approval: "never" as const,
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.allowedTools?.length
      ? { allowed_tools: options.allowedTools }
      : {}),
    ...(options?.serverDescription
      ? { server_description: options.serverDescription }
      : {}),
  };
}

export function buildGoogleMapsMcpServerTool(options?: {
  intent?: string;
  allowedTools?: string[];
}): McpToolDefinition | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!isGoogleMapsGroundingLiteEnabled() || !apiKey) {
    return null;
  }
  if (!MCP_ALLOWLISTED_SERVERS.has(GOOGLE_MAPS_MCP_SERVER_URL)) {
    console.warn(
      `[mcp] Server URL not in allowlist: ${GOOGLE_MAPS_MCP_SERVER_URL}`,
    );
    return null;
  }

  const allowedTools =
    options?.allowedTools?.filter(Boolean) ??
    getGoogleMapsAllowedRemoteTools(options?.intent);

  if (allowedTools.length === 0) {
    return null;
  }

  return {
    type: "mcp",
    server_label: "google_maps",
    server_url: GOOGLE_MAPS_MCP_SERVER_URL,
    require_approval: "never",
    headers: {
      "X-Goog-Api-Key": apiKey,
    },
    allowed_tools: allowedTools,
    server_description:
      "Google Maps Grounding Lite tools for places search, routes, and weather.",
  };
}

/**
 * Determine tool routing: MCP vs direct gateway.
 * Returns "mcp" if the tool should go through MCP, "direct" for legacy path.
 */
export function resolveToolTransport(
  toolName: string,
): "mcp" | "direct" {
  const entry = resolveToolCatalogEntry(toolName);
  if (!entry) return "direct";

  if (entry.destination === "mcp") {
    return isGoogleMapsGroundingLiteEnabled() ? "mcp" : "direct";
  }

  if (entry.destination !== "gateway") return "direct";
  if (!isMcpGatewayEnabled()) return "direct";

  return "mcp";
}
