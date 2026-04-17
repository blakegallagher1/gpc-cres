import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getWorkflowExecution } from "@gpc/server/workflows/workflow-orchestrator.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    const execution = await getWorkflowExecution(auth.orgId, parsed.data.executionId);
    if (!execution || execution.dealId !== parsed.data.id) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }
    return NextResponse.json({ execution });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.workflows.execution", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load execution" }, { status: 500 });
  }
}
