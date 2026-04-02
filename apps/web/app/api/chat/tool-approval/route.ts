import { NextRequest } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  resumeAgentToolApproval,
  type AgentStreamEvent,
} from "@/lib/agent/executeAgent";
import { sanitizeChatErrorMessage } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  let body: {
    runId?: string;
    toolCallId?: string;
    action?: "approve" | "reject";
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : null;
  const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId : null;
  const action = body.action === "approve" || body.action === "reject" ? body.action : null;

  if (!runId || !toolCallId || !action) {
    return Response.json(
      { error: "runId, toolCallId, and action are required." },
      { status: 400 },
    );
  }

  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? Response.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;

  if (shouldUseAppDatabaseDevFallback()) {
    const sanitized = sanitizeChatErrorMessage(
      "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
    );
    return Response.json(
      { error: sanitized.message, code: sanitized.code, events: [] },
      { status: 500 },
    );
  }

  const events: AgentStreamEvent[] = [];
  try {
    await resumeAgentToolApproval({
      orgId: auth.orgId,
      userId: auth.userId,
      runId,
      toolCallId,
      action,
      onEvent: (event) => events.push(event),
    });

    return Response.json({ ok: true, events });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.chat.tool-approval", method: "POST" },
    });
    const message =
      error instanceof Error ? error.message : "Failed to apply approval decision";
    const sanitized = sanitizeChatErrorMessage(message);
    return Response.json(
      { error: sanitized.message, code: sanitized.code, events },
      { status: 500 },
    );
  }
}
