import "server-only";

import {
  ALL_AGENT_TOOLS,
  resolveToolCatalogEntry,
  resolveToolName,
  SPECIALIST_CONSULT_TOOLS,
  TOOL_NAME_ALIASES,
  type ToolCatalogEntry,
} from "@entitlement-os/openai";
import { hydrateRequiredNullableToolArgs } from "./toolInvokeInput";

/**
 * Tool Registry — maps tool names to their execute functions.
 *
 * This is the dispatch layer used by /api/agent/tools/execute to run
 * tools on behalf of the Cloudflare Worker.
 *
 * Tools that need orgId/userId inject them from the server-validated auth
 * context, NOT from the request body (prevents privilege escalation).
 */

type ToolExecuteFn = (
  args: Record<string, unknown>,
  context: { orgId: string; userId: string; conversationId: string; dealId?: string },
) => Promise<unknown>;

type AgentToolLike = {
  name: string;
  invoke: (runContext: unknown, input: string, details?: unknown) => Promise<unknown>;
  [key: string]: unknown;
};

function isAgentTool(value: unknown): value is AgentToolLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { name?: unknown; invoke?: unknown };
  return typeof candidate.name === "string" && typeof candidate.invoke === "function";
}

/**
 * Wraps an @openai/agents tool() object into a simple execute function.
 *
 * The SDK's tool() returns objects with `.invoke(runContext, jsonInput, details)`
 * which parses the JSON string, validates via Zod, then calls the user's execute fn.
 * We inject orgId into the args before invoking.
 */
function wrapTool(agentTool: AgentToolLike): ToolExecuteFn {
  return async (args, context) => {
    if (!agentTool.invoke) {
      throw new Error(`Tool has no invoke function`);
    }
    // Inject orgId into args and hydrate missing required-nullable fields.
    const enrichedArgs = hydrateRequiredNullableToolArgs(agentTool.parameters, {
      ...args,
      orgId: context.orgId,
    });
    // Pass auth context as RunContext so memory tools can extract orgId/userId
    // for their internal HTTP calls (buildMemoryToolHeaders expects { context: { orgId, userId } })
    const runContext = { context: { orgId: context.orgId, userId: context.userId } };
    return agentTool.invoke(runContext, JSON.stringify(enrichedArgs), {});
  };
}

const TOOLS = (() => {
  const seen = new Map<string, AgentToolLike>();

  for (const candidate of ALL_AGENT_TOOLS) {
    if (!isAgentTool(candidate)) {
      continue;
    }

    const existing = seen.get(candidate.name);
    if (!existing) {
      seen.set(candidate.name, candidate);
      continue;
    }

    // The same tool symbol may be intentionally shared across tool groups.
    if (existing !== candidate && existing.invoke !== candidate.invoke) {
      throw new Error(`Duplicate tool registration detected for ${candidate.name}`);
    }
  }

  return [...seen.values()];
})();

const registry: Record<string, ToolExecuteFn> = Object.create(null);

function registerTool(
  key: string,
  execute: ToolExecuteFn,
) {
  const existing = registry[key];
  if (existing && existing !== execute) {
    throw new Error(`Duplicate tool registration conflict for ${key}`);
  }
  registry[key] = execute;
}

function registerToolWithAlias(
  toolName: string,
  execute: ToolExecuteFn,
) {
  const canonicalToolName = resolveToolName(toolName);
  registerTool(canonicalToolName, execute);
  registerTool(toolName, execute);
}

/** Shell workflow tool names that require local filesystem/shell — cannot run on Vercel. */
const SHELL_WORKFLOW_TOOLS = new Set([
  "run_underwriting_workflow",
  "run_data_extraction_workflow",
  "analyze_market_workflow",
]);

function makeShellWorkflowStub(toolName: string): ToolExecuteFn {
  return async () => ({
    error: `Tool '${toolName}' requires the local compute environment and cannot run in serverless. Route to the gateway instead.`,
    status: "unsupported_environment",
  });
}

for (const tool of TOOLS) {
  if (SHELL_WORKFLOW_TOOLS.has(tool.name)) {
    // Register a safe stub instead of wrapping the real tool (which would
    // try to resolve the skills directory on first invocation and fail).
    registerToolWithAlias(tool.name, makeShellWorkflowStub(tool.name));
  } else {
    registerToolWithAlias(tool.name, wrapTool(tool));
  }
}

/**
 * Consult tools — run specialist agents via the Agents SDK `run()`.
 * When the CF Worker calls /api/agent/tools/execute with a consult tool,
 * we create the specialist agent and run it for a single turn with the input.
 */
const CONSULT_SPECIALIST_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  SPECIALIST_CONSULT_TOOLS.map(
    (toolConfig: { toolName: string; key: string }): [string, string] => [toolConfig.toolName, toolConfig.key],
  ),
);

for (const [toolName, specialistKey] of Object.entries(CONSULT_SPECIALIST_MAP)) {
  const consultToolExecute: ToolExecuteFn = async (args: Record<string, unknown>) => {
    const input = typeof args.input === "string" ? args.input : JSON.stringify(args);
    try {
      // Lazy import to avoid circular deps and keep the registry lightweight
      const { createIntentAwareCoordinator, run } = await import("@entitlement-os/openai");
      const intent = specialistKey as Parameters<typeof createIntentAwareCoordinator>[0];
      const agent = createIntentAwareCoordinator(intent);
      const result = await run(agent, input, { maxTurns: 3 });
      return { result: result.finalOutput ?? "(No output from specialist)", status: "ok" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[consult] ${toolName} failed:`, message);
      return { result: `Specialist consultation failed: ${message}`, status: "error" };
    }
  };
  registerToolWithAlias(toolName, consultToolExecute);
}

const unresolvedAliases: string[] = [];
for (const [aliasToolName, canonicalToolName] of Object.entries(TOOL_NAME_ALIASES)) {
  const execute = registry[canonicalToolName];
  if (!execute) {
    const entry = resolveToolCatalogEntry(canonicalToolName);
    if (entry?.destination !== "hosted" && entry?.destination !== "mcp") {
      unresolvedAliases.push(`${aliasToolName}->${canonicalToolName}`);
    }
    continue;
  }
  registerTool(aliasToolName, execute);
}

if (unresolvedAliases.length > 0) {
  throw new Error(
    `Tool alias targets missing executable handlers: ${unresolvedAliases.join(", ")}`,
  );
}

export const toolRegistry: Readonly<Record<string, ToolExecuteFn>> = Object.freeze(registry);
