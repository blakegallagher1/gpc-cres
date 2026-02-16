import { NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  resumeSerializedAgentRun,
  type AgentStreamEvent,
} from "@/lib/agent/executeAgent";

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

  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    const message =
      error instanceof Error ? error.message : "Failed to resume run";
    return Response.json({ error: message, events }, { status: 500 });
  }
}
