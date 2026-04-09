import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  isToolExecutionFailure,
  TOOL_EXECUTION_TIMEOUT_MS,
  toolRegistry,
} from "@/lib/agent/toolRegistry";
import { logger } from "@/lib/agent/loggerAdapter";
import * as Sentry from "@sentry/nextjs";
import {
  type ToolDestination,
  type ToolQuotaClass,
  type ToolRiskLevel,
  checkHostedToolQuota,
  getHostedToolUsage,
  recordHostedToolUsage,
  resolveToolCatalogEntry,
  resolveToolName,
  resolveToolTransport,
} from "@entitlement-os/openai";

/**
 * POST /api/agent/tools/execute
 *
 * Executes a tool on behalf of the Cloudflare Worker.
 * Auth is validated server-side via authorizeApiRoute — orgId/userId come from
 * the verified auth context, never from the request body.
 */

const ToolExecutionContextSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  dealId: z.string().trim().optional(),
  runId: z.string().trim().optional(),
});

const RawToolExecutionRequestSchema = z.object({
  toolName: z.unknown().optional(),
  tool: z.unknown().optional(),
  arguments: z.unknown().optional(),
  context: z.unknown().optional(),
  conversationId: z.unknown().optional(),
  dealId: z.unknown().optional(),
  runId: z.unknown().optional(),
}).passthrough();

const ToolExecutionRequestSchema = z.object({
  toolName: z.string().trim().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  context: ToolExecutionContextSchema.optional(),
});

type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;

type ToolMetadata = {
  requestedToolName: string;
  toolName: string;
  name: string;
  destination: ToolDestination;
  risk: ToolRiskLevel;
  quotaClass: ToolQuotaClass;
  transport: "direct" | "mcp";
};

type ToolExecutionDiagnostics = {
  requestId: string;
  conversationId: string;
  runId?: string;
  retryable?: boolean;
  failureCode?: string;
  timeoutMs?: number;
};

type RawToolExecutionPayload = z.infer<typeof RawToolExecutionRequestSchema>;

function normalizeToolExecutionContext(payload: RawToolExecutionPayload): {
  conversationId?: string;
  dealId?: string;
  runId?: string;
} {
  const contextCandidate: Record<string, unknown> =
    typeof payload.context === "object" && payload.context !== null
      ? (payload.context as Record<string, unknown>)
      : {};

  return {
    conversationId:
      typeof contextCandidate.conversationId === "string" &&
      contextCandidate.conversationId.trim().length > 0
        ? contextCandidate.conversationId.trim()
        : typeof payload.conversationId === "string" &&
            payload.conversationId.trim().length > 0
          ? payload.conversationId.trim()
          : undefined,
    dealId:
      typeof contextCandidate.dealId === "string" &&
      contextCandidate.dealId.trim().length > 0
        ? contextCandidate.dealId.trim()
        : typeof payload.dealId === "string" && payload.dealId.trim().length > 0
          ? payload.dealId.trim()
          : undefined,
    runId:
      typeof contextCandidate.runId === "string" && contextCandidate.runId.trim().length > 0
        ? contextCandidate.runId.trim()
        : typeof payload.runId === "string" && payload.runId.trim().length > 0
          ? payload.runId.trim()
          : undefined,
  };
}

function normalizeToolExecutionRequest(
  payload: RawToolExecutionPayload,
): ToolExecutionRequest {
  const normalizedContext = normalizeToolExecutionContext(payload);
  const toolName =
    typeof payload.toolName === "string"
      ? payload.toolName.trim()
      : typeof payload.tool === "string"
        ? payload.tool.trim()
        : "";

  let requestArgs: unknown;
  if (payload.arguments !== undefined) {
    requestArgs = payload.arguments;
  } else {
    // Legacy payload shape: fields are flattened at the top level.
    const legacyArgs = { ...payload };
    delete legacyArgs.toolName;
    delete legacyArgs.tool;
    delete legacyArgs.arguments;
    delete legacyArgs.context;
    delete legacyArgs.conversationId;
    delete legacyArgs.dealId;
    delete legacyArgs.runId;
    requestArgs = legacyArgs;
  }

  const normalizedRequest = {
    toolName,
    arguments: requestArgs,
    ...(Object.keys(normalizedContext).length > 0
      ? { context: normalizedContext }
      : {}),
  };

  return ToolExecutionRequestSchema.parse(normalizedRequest);
}

function getToolMetadata(
  requestedToolName: string,
  canonicalToolName: string,
  entry: NonNullable<ReturnType<typeof resolveToolCatalogEntry>>,
): ToolMetadata {
  const destination = entry.destination;
  const transport =
    destination === "gateway" || destination === "mcp"
      ? resolveToolTransport(canonicalToolName)
      : "direct";

  return {
    requestedToolName,
    toolName: canonicalToolName,
    name: entry.name,
    destination,
    risk: entry.risk,
    quotaClass: entry.quotaClass,
    transport,
  };
}

function getRequestId(req: NextRequest): string {
  const forwardedRequestId = req.headers.get("x-request-id")?.trim();
  if (forwardedRequestId && forwardedRequestId.length > 0) {
    return forwardedRequestId;
  }
  return crypto.randomUUID();
}

function jsonWithRequestId(
  requestId: string,
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-gpc-tool-request-id": requestId,
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  let auth;
  try {
    const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
    auth = authorization.ok ? authorization.auth : null;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.tools.execute", method: "POST" },
    });
    logger.error("Tool execution auth resolution failed", {
      route: "api.agent.tools.execute",
      method: "POST",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Auth resolution failed" },
      500,
    );
  }

  if (!auth) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, 401);
  }

  let requestBody: ToolExecutionRequest;
  try {
    const rawBody = await req.json();
    const rawRequest = RawToolExecutionRequestSchema.parse(rawBody);
    requestBody = normalizeToolExecutionRequest(rawRequest);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.tools.execute", method: "POST" },
    });
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 },
      );
    }
    return jsonWithRequestId(requestId, { error: "Invalid JSON body" }, 400);
  }

  const requestedToolName = requestBody.toolName;
  const canonicalToolName = resolveToolName(requestedToolName);
  const catalogEntry = resolveToolCatalogEntry(canonicalToolName);
  const tool = toolRegistry[canonicalToolName];

  if (!catalogEntry && !tool) {
    return jsonWithRequestId(
      requestId,
      { error: `Unknown tool: ${requestedToolName}` },
      400,
    );
  }

  if (!catalogEntry) {
    return jsonWithRequestId(
      requestId,
      {
        error: `Tool catalog entry missing for registered tool: ${canonicalToolName}`,
        metadata: {
          requestedToolName,
          toolName: canonicalToolName,
          destination: "local",
          risk: "read",
          quotaClass: "unlimited",
          transport: "direct",
        },
      },
      400,
    );
  }

  let metadata: ToolMetadata;
  try {
    metadata = getToolMetadata(requestedToolName, canonicalToolName, catalogEntry);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.tools.execute", method: "POST" },
    });
    return jsonWithRequestId(
      requestId,
      {
        error: err instanceof Error ? err.message : "Tool transport policy unavailable",
        metadata: {
          requestedToolName,
          toolName: canonicalToolName,
          destination: "local",
          risk: "read",
          quotaClass: "unlimited",
          transport: "direct",
        },
      },
      400,
    );
  }

  if (!tool) {
    if (metadata.destination === "hosted" || metadata.destination === "mcp") {
      return jsonWithRequestId(
        requestId,
        {
          error:
            metadata.destination === "mcp"
              ? `MCP tool '${canonicalToolName}' is executed by OpenAI and should not be dispatched via /api/agent/tools/execute`
              : `Hosted tool '${canonicalToolName}' is executed by OpenAI and should not be dispatched via /api/agent/tools/execute`,
          metadata,
        },
        400,
      );
    }
    return jsonWithRequestId(
      requestId,
      { error: `Unknown tool: ${requestedToolName}` },
      400,
    );
  }

  const conversationId = requestBody.context?.conversationId?.trim() ?? "";

  if (metadata.destination === "hosted" && !conversationId) {
    return jsonWithRequestId(
      requestId,
      {
        error: "Hosted tools require context.conversationId",
        metadata: {
          ...metadata,
          conversationId,
        },
      },
      400,
    );
  }

  if (metadata.destination === "hosted") {
    const quotaCheck = checkHostedToolQuota(
      conversationId,
      canonicalToolName,
    );
    if (!quotaCheck.allowed) {
      return jsonWithRequestId(
        requestId,
        {
          error: quotaCheck.reason,
          metadata: {
            ...metadata,
            conversationId,
            usage: {
              conversationId,
              current: getHostedToolUsage(
                conversationId,
                canonicalToolName,
              ),
            },
          },
        },
        429,
      );
    }
  }

  const runContext = {
    orgId: auth.orgId,
    userId: auth.userId,
    conversationId,
    dealId: requestBody.context?.dealId,
    runId: requestBody.context?.runId,
    requestId,
  };

  try {
    const result = await tool(requestBody.arguments, runContext);

    if (metadata.destination === "hosted") {
      recordHostedToolUsage(conversationId, canonicalToolName);
    }

    return jsonWithRequestId(
      requestId,
      {
        result,
        metadata: {
          ...metadata,
          requestId,
          conversationId,
          runId: requestBody.context?.runId,
          usage:
            metadata.destination === "hosted"
              ? {
                  conversationId,
                  current: getHostedToolUsage(
                    conversationId,
                    canonicalToolName,
                  ),
                }
              : undefined,
        },
      },
      200,
    );
  } catch (err: unknown) {
    const failure = isToolExecutionFailure(err) ? err : null;
    const message = failure?.message ?? (err instanceof Error ? err.message : "Tool execution failed");
    const status = failure?.httpStatus ?? 500;
    const diagnostics: ToolExecutionDiagnostics = {
      requestId,
      conversationId,
      runId: requestBody.context?.runId,
      retryable: failure?.retryable,
      failureCode: failure?.code,
      timeoutMs: failure?.code === "tool_timeout" ? TOOL_EXECUTION_TIMEOUT_MS : undefined,
    };

    logger.error("Tool execution route failed", {
      route: "api.agent.tools.execute",
      method: "POST",
      requestId,
      requestedToolName,
      canonicalToolName,
      destination: metadata.destination,
      conversationId,
      runId: requestBody.context?.runId,
      retryable: diagnostics.retryable ?? false,
      failureCode: diagnostics.failureCode ?? "unknown",
      error: message,
    });

    return jsonWithRequestId(
      requestId,
      {
        error: message,
        metadata: {
          name: metadata.name,
          toolName: metadata.toolName,
          destination: metadata.destination,
          risk: metadata.risk,
          quotaClass: metadata.quotaClass,
          transport: metadata.transport,
          requestId,
          ...(metadata.destination === "hosted"
            ? { usage: { conversationId } }
            : {}),
        },
        diagnostics,
      },
      status,
    );
  }
}
