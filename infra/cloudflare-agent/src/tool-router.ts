/* ------------------------------------------------------------------
 * Tool Router — decides where each tool call executes and dispatches it
 * ------------------------------------------------------------------ */

import type { Env } from "./types";

const TOOL_TIMEOUT_MS = 30_000;
const PROPERTY_DB_INTERNAL_SCOPE_HEADER = "x-gpc-internal-scope";
const PROPERTY_DB_INTERNAL_SCOPE_VALUE = "parcels.read";

/** Gateway tool name → endpoint path */
const GATEWAY_TOOLS: Record<string, string> = {
  get_parcel_details: "/tools/parcel.lookup",
  screen_flood: "/api/screening/flood",
  screen_soils: "/api/screening/soils",
  screen_wetlands: "/api/screening/wetlands",
  screen_epa: "/api/screening/epa",
  screen_traffic: "/api/screening/traffic",
  screen_ldeq: "/api/screening/ldeq",
  screen_full: "/api/screening/full",
  // query_property_db removed — use query_property_db_sql for all property queries
  query_property_db_sql: "/tools/parcels.sql",
  // screen_zoning: no gateway endpoint — routes to Vercel
};

const HOSTED_TOOLS = new Set([
  "web_search",
  "web_search_preview",
  "file_search",
  "code_interpreter",
]);

export type ToolDestination = "gateway" | "vercel" | "hosted";

export function routeTool(name: string): ToolDestination {
  if (GATEWAY_TOOLS[name]) return "gateway";
  if (HOSTED_TOOLS.has(name)) return "hosted";
  return "vercel";
}

/**
 * Transform tool arguments for gateway endpoints.
 * Gateway screening endpoints use snake_case: parcel_id, radius_m (meters).
 * The agent tool schemas use parcel_id + radius_miles, so convert miles → meters.
 */
function transformGatewayArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName === "get_parcel_details") return args; // parcel.lookup uses parcel_id as-is
  if (toolName === "query_property_db_sql") return args; // pass-through
  // Screening endpoints: parcel_id stays, convert radius_miles → radius_m
  const transformed: Record<string, unknown> = {};
  if (args.parcel_id != null) transformed.parcel_id = args.parcel_id;
  if (args.radius_miles != null) transformed.radius_m = Number(args.radius_miles) * 1609.34;
  return transformed;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the FastAPI gateway with retry on 5xx.
 */
async function callGateway(
  env: Env,
  path: string,
  body: unknown,
): Promise<unknown> {
  const accessHeaders: Record<string, string> = {};
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    accessHeaders["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    accessHeaders["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${env.LOCAL_API_URL}${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.LOCAL_API_KEY}`,
            "Content-Type": "application/json",
            [PROPERTY_DB_INTERNAL_SCOPE_HEADER]: PROPERTY_DB_INTERNAL_SCOPE_VALUE,
            ...accessHeaders,
          },
          body: JSON.stringify(body),
        },
        TOOL_TIMEOUT_MS,
      );
      if (res.ok) return res.json();
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      const text = await res.text();
      return { error: `Gateway error (${res.status}): ${text.slice(0, 200)}` };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { error: `Tool timed out after ${TOOL_TIMEOUT_MS / 1000}s` };
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return { error: `Gateway fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return { error: "Gateway: max retries exhausted" };
}

/**
 * Call Vercel tool-execution endpoint, forwarding the user's Auth.js/NextAuth bearer token.
 */
async function callVercel(
  env: Env,
  toolName: string,
  args: Record<string, unknown>,
  userToken: string,
  context: { conversationId: string; dealId?: string },
): Promise<unknown> {
  try {
    const res = await fetchWithTimeout(
      `${env.VERCEL_URL}/api/agent/tools/execute`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toolName,
          arguments: args,
          context,
        }),
      },
      TOOL_TIMEOUT_MS,
    );
    if (res.ok) {
      const data = (await res.json()) as { result?: unknown; error?: string };
      return data.result ?? data;
    }
    if (res.status === 401 || res.status === 403) {
      return { error: "Authentication failed. User session may have expired." };
    }
    const text = await res.text();
    return { error: `Vercel error (${res.status}): ${text.slice(0, 200)}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: `Tool '${toolName}' timed out after ${TOOL_TIMEOUT_MS / 1000}s` };
    }
    return { error: `Tool '${toolName}' failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Execute a tool call, routing to the appropriate backend.
 * Returns the JSON result as a string (for OpenAI function_call_output).
 */
export async function executeTool(
  env: Env,
  toolName: string,
  argsJson: string,
  userToken: string,
  context: { conversationId: string; dealId?: string },
): Promise<string> {
  const destination = routeTool(toolName);

  if (destination === "hosted") {
    // Hosted tools are executed by OpenAI server-side; should never reach here
    return JSON.stringify({ error: `'${toolName}' is a hosted tool — executed by OpenAI, not the Worker` });
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return JSON.stringify({ error: `Invalid JSON arguments for tool '${toolName}'` });
  }

  let result: unknown;

  if (destination === "gateway") {
    const endpoint = GATEWAY_TOOLS[toolName];
    const transformedArgs = transformGatewayArgs(toolName, args);
    result = await callGateway(env, endpoint, transformedArgs);
  } else {
    result = await callVercel(env, toolName, args, userToken, context);
  }

  return JSON.stringify(result);
}
