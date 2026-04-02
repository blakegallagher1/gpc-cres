import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import { toolRegistry } from "@/lib/agent/toolRegistry";
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

export async function POST(req: NextRequest) {
  let auth;
  try {
    const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
    auth = authorization.ok ? authorization.auth : null;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.tools.execute", method: "POST" },
    });
    console.error("[tools/execute] resolveAuth error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth resolution failed" },
      { status: 500 },
    );
  }

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedToolName = requestBody.toolName;
  const canonicalToolName = resolveToolName(requestedToolName);
  const catalogEntry = resolveToolCatalogEntry(canonicalToolName);
  const tool = toolRegistry[canonicalToolName];

  if (!catalogEntry && !tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${requestedToolName}` },
      { status: 400 },
    );
  }

  if (!catalogEntry) {
    return NextResponse.json(
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
      { status: 400 },
    );
  }

  let metadata: ToolMetadata;
  try {
    metadata = getToolMetadata(requestedToolName, canonicalToolName, catalogEntry);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.agent.tools.execute", method: "POST" },
    });
    return NextResponse.json(
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
      { status: 400 },
    );
  }

  if (!tool) {
    if (metadata.destination === "hosted" || metadata.destination === "mcp") {
      return NextResponse.json(
        {
          error:
            metadata.destination === "mcp"
              ? `MCP tool '${canonicalToolName}' is executed by OpenAI and should not be dispatched via /api/agent/tools/execute`
              : `Hosted tool '${canonicalToolName}' is executed by OpenAI and should not be dispatched via /api/agent/tools/execute`,
          metadata,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `Unknown tool: ${requestedToolName}` },
      { status: 400 },
    );
  }

  const conversationId = requestBody.context?.conversationId?.trim() ?? "";

  if (metadata.destination === "hosted" && !conversationId) {
    return NextResponse.json(
      {
        error: "Hosted tools require context.conversationId",
        metadata: {
          ...metadata,
          conversationId,
        },
      },
      { status: 400 },
    );
  }

  if (metadata.destination === "hosted") {
    const quotaCheck = checkHostedToolQuota(
      conversationId,
      canonicalToolName,
    );
    if (!quotaCheck.allowed) {
      return NextResponse.json(
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
        { status: 429 },
      );
    }
  }

  const runContext = {
    orgId: auth.orgId,
    userId: auth.userId,
    conversationId,
    dealId: requestBody.context?.dealId,
  };

  try {
    const result = await tool(requestBody.arguments, runContext);

    if (metadata.destination === "hosted") {
      recordHostedToolUsage(conversationId, canonicalToolName);
    }

    return NextResponse.json({
      result,
      metadata: {
        ...metadata,
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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return NextResponse.json(
      {
        error: message,
        metadata: {
          name: metadata.name,
          toolName: metadata.toolName,
          destination: metadata.destination,
          risk: metadata.risk,
          quotaClass: metadata.quotaClass,
          transport: metadata.transport,
          ...(metadata.destination === "hosted"
            ? { usage: { conversationId } }
            : {}),
        },
      },
      { status: 500 },
    );
  }
}
