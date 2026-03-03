import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { toolRegistry } from "@/lib/agent/toolRegistry";

/**
 * POST /api/agent/tools/execute
 *
 * Executes a tool on behalf of the Cloudflare Worker.
 * Auth is validated server-side via the forwarded Supabase JWT —
 * orgId/userId come from resolveAuth(req), never from the request body.
 */
export async function POST(req: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(req);
  } catch (err) {
    console.error("[tools/execute] resolveAuth error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth resolution failed" },
      { status: 500 },
    );
  }
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    toolName: string;
    arguments: Record<string, unknown>;
    context: {
      conversationId: string;
      dealId?: string;
      runId?: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { toolName, arguments: args } = body;

  if (!toolName || typeof toolName !== "string") {
    return NextResponse.json({ error: "Missing toolName" }, { status: 400 });
  }

  const tool = toolRegistry[toolName];
  if (!tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${toolName}` },
      { status: 400 },
    );
  }

  try {
    const result = await tool(args ?? {}, {
      orgId: auth.orgId,
      userId: auth.userId,
      conversationId: body.context?.conversationId ?? "",
      dealId: body.context?.dealId,
    });
    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Tool execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
