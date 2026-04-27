import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { listWorkflowExecutions } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10))) : 50;

  try {
    const executions = await listWorkflowExecutions(auth.orgId, limit);
    return NextResponse.json({ executions });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.automation.workflow-executions", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load workflow executions" }, { status: 500 });
  }
}
