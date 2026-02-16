import { NextRequest } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  resumeAgentToolApproval,
  type AgentStreamEvent,
} from "@/lib/agent/executeAgent";

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

  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    const message =
      error instanceof Error ? error.message : "Failed to apply approval decision";
    return Response.json({ error: message, events }, { status: 500 });
  }
}
