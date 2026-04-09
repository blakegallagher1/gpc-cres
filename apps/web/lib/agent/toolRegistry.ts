import "server-only";

import {
  ALL_AGENT_TOOLS,
  resolveToolCatalogEntry,
  resolveToolName,
  TOOL_NAME_ALIASES,
  type ToolCatalogEntry,
} from "@entitlement-os/openai";
import { hydrateRequiredNullableToolArgs } from "./toolInvokeInput";
import { logger } from "./loggerAdapter";

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
  context: {
    orgId: string;
    userId: string;
    conversationId: string;
    dealId?: string;
    runId?: string;
    requestId?: string;
  },
) => Promise<unknown>;

type ToolExecutionStatus = "success" | "tool_error" | "error" | "timeout";

type ToolExecutionFailureCode = "tool_timeout" | "tool_execution_failed";

export const TOOL_EXECUTION_TIMEOUT_MS = 45_000;

export class ToolExecutionFailure extends Error {
  readonly code: ToolExecutionFailureCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly toolName: string;
  readonly requestId?: string;
  readonly durationMs?: number;

  constructor(params: {
    message: string;
    code: ToolExecutionFailureCode;
    httpStatus: number;
    retryable: boolean;
    toolName: string;
    requestId?: string;
    durationMs?: number;
    cause?: unknown;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = "ToolExecutionFailure";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.retryable = params.retryable;
    this.toolName = params.toolName;
    this.requestId = params.requestId;
    this.durationMs = params.durationMs;
  }
}

export function isToolExecutionFailure(error: unknown): error is ToolExecutionFailure {
  return error instanceof ToolExecutionFailure;
}

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

async function runWithTimeout<T>(
  operation: Promise<T>,
  context: { toolName: string; requestId?: string },
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new ToolExecutionFailure({
              message: `Tool '${context.toolName}' exceeded ${TOOL_EXECUTION_TIMEOUT_MS}ms and was canceled`,
              code: "tool_timeout",
              httpStatus: 504,
              retryable: true,
              toolName: context.toolName,
              requestId: context.requestId,
              durationMs: TOOL_EXECUTION_TIMEOUT_MS,
            }),
          );
        }, TOOL_EXECUTION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
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
    const startMs = Date.now();
    let status: ToolExecutionStatus = "success";
    let errorMessage: string | undefined;

    try {
      // Inject orgId into args and hydrate missing required-nullable fields.
      const enrichedArgs = hydrateRequiredNullableToolArgs(agentTool.parameters, {
        ...args,
        orgId: context.orgId,
      });
      // Pass auth context as RunContext so memory tools can extract orgId/userId
      // for their internal HTTP calls (buildMemoryToolHeaders expects { context: { orgId, userId } })
      const runContext = { context: { orgId: context.orgId, userId: context.userId } };
      const result = await runWithTimeout(
        agentTool.invoke(runContext, JSON.stringify(enrichedArgs), {}),
        { toolName: agentTool.name, requestId: context.requestId },
      );

      if (typeof result === "string") {
        try {
          const parsed = JSON.parse(result) as { error?: unknown };
          if (typeof parsed.error === "string" && parsed.error.length > 0) {
            status = "tool_error";
            errorMessage = parsed.error;
          }
        } catch {
          // Non-JSON string results are valid tool outputs; keep status as success.
        }
      }

      return result;
    } catch (error) {
      status = isToolExecutionFailure(error) && error.code === "tool_timeout" ? "timeout" : "error";
      errorMessage = error instanceof Error ? error.message : String(error);
      if (isToolExecutionFailure(error)) {
        throw error;
      }
      throw new ToolExecutionFailure({
        message: errorMessage,
        code: "tool_execution_failed",
        httpStatus: 500,
        retryable: false,
        toolName: agentTool.name,
        requestId: context.requestId,
        durationMs: Date.now() - startMs,
        cause: error,
      });
    } finally {
      const durationMs = Date.now() - startMs;
      const logContext = {
        tool: agentTool.name,
        orgId: context.orgId,
        userId: context.userId,
        conversationId: context.conversationId,
        ...(context.dealId ? { dealId: context.dealId } : {}),
        ...(context.runId ? { runId: context.runId } : {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
        durationMs,
        status,
        ...(errorMessage ? { error: errorMessage } : {}),
      };

      if (status === "error" || status === "timeout") {
        logger.warn("Tool execution failed", logContext);
      } else {
        logger.info("Tool execution completed", logContext);
      }
    }
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
