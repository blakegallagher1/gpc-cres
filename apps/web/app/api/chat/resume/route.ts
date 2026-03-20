import { NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  resumeSerializedAgentRun,
  type AgentStreamEvent,
} from "@/lib/agent/executeAgent";
import { sanitizeChatErrorMessage } from "@/app/api/chat/_lib/errorHandling";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  let body: {
    runId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId) {
    return Response.json({ error: "runId is required." }, { status: 400 });
  }

  const auth = await resolveAuth(req);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const result = await resumeSerializedAgentRun({
      orgId: auth.orgId,
      userId: auth.userId,
      runId,
      onEvent: (event) => events.push(event),
    });

    return Response.json({
      ok: true,
      runId: result.runId,
      status: result.status,
      events,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.chat.resume", method: "POST" },
    });
    const message =
      error instanceof Error ? error.message : "Failed to resume run";
    const sanitized = sanitizeChatErrorMessage(message);
    return Response.json(
      { error: sanitized.message, code: sanitized.code, events },
      { status: 500 },
    );
  }
}
