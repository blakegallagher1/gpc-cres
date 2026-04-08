import { NextRequest, NextResponse } from "next/server";
import { getRunTraces, RunRouteNotFoundError } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/runs/[runId]/traces - trace list (best-effort; returns [] if traces table is unavailable)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    try {
      return NextResponse.json({
        traces: await getRunTraces(auth.orgId, runId),
      });
    } catch (traceError) {
      if (traceError instanceof RunRouteNotFoundError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      Sentry.captureException(traceError, {
        tags: { route: "api.runs.traces", method: "GET" },
      });
      // The traces table is not part of the Prisma schema/migrations yet in some envs.
      // Fail open by returning an empty list so the run detail UI can still render.
      console.warn("Traces query failed; returning empty traces list.", traceError);
      return NextResponse.json({ traces: [] });
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.runs.traces", method: "GET" },
    });
    console.error("Error fetching run traces:", error);
    return NextResponse.json(
      { error: "Failed to fetch traces" },
      { status: 500 },
    );
  }
}
