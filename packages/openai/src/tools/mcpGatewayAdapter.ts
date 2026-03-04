/**
 * MCP Gateway Adapter — routes eligible gateway-like tools through MCP
 * when OPENAI_MCP_GATEWAY_ENABLED=true. Falls back to direct gateway routing
 * when disabled.
 *
 * This module does NOT replace existing gateway routing — it provides an
 * alternative transport layer using the OpenAI MCP connector pattern.
 */

import { TOOL_CATALOG, type ToolCatalogEntry } from "./toolCatalog.js";

const MCP_ALLOWLISTED_SERVERS = new Set([
  "https://api.gallagherpropco.com",
]);

export function isMcpGatewayEnabled(): boolean {
  return process.env.OPENAI_MCP_GATEWAY_ENABLED === "true";
}

/**
 * Get tools that are eligible for MCP routing (gateway tools only).
 * Returns catalog entries for tools that can be served via MCP.
 */
export function getMcpEligibleTools(): ToolCatalogEntry[] {
  if (!isMcpGatewayEnabled()) return [];
  return Object.values(TOOL_CATALOG).filter((e) => e.destination === "gateway");
}

/**
 * Build an MCP server tool definition for the Responses API.
 * This returns the tool configuration that tells OpenAI to proxy
 * the tool call through the MCP server.
 *
 * See: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
 */
export function buildMcpServerTool(serverUrl: string): {
  type: "mcp";
  server_label: string;
  server_url: string;
  require_approval: "never";
} | null {
  if (!isMcpGatewayEnabled()) return null;
  if (!MCP_ALLOWLISTED_SERVERS.has(serverUrl)) {
    console.warn(`[mcp] Server URL not in allowlist: ${serverUrl}`);
    return null;
  }

  return {
    type: "mcp" as const,
    server_label: "gateway",
    server_url: serverUrl,
    require_approval: "never" as const,
  };
}

/**
 * Determine tool routing: MCP vs direct gateway.
 * Returns "mcp" if the tool should go through MCP, "direct" for legacy path.
 */
export function resolveToolTransport(
  toolName: string,
): "mcp" | "direct" {
  if (!isMcpGatewayEnabled()) return "direct";

  const entry = TOOL_CATALOG[toolName];
  if (!entry || entry.destination !== "gateway") return "direct";

  return "mcp";
}
