import { NextRequest, NextResponse } from "next/server";
import { deleteRun, getRunDetail, RunRouteNotFoundError } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/runs/[runId] - run details (org-scoped)
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
    return NextResponse.json({
      run: await getRunDetail(auth.orgId, runId),
    });
  } catch (error) {
    if (error instanceof RunRouteNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.runs", method: "GET" },
    });
    console.error("Error fetching run:", error);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}

// DELETE /api/runs/[runId] - delete run (org-scoped)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;
    await deleteRun(auth.orgId, runId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RunRouteNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.runs", method: "DELETE" },
    });
    console.error("Error deleting run:", error);
    return NextResponse.json({ error: "Failed to delete run" }, { status: 500 });
  }
}
