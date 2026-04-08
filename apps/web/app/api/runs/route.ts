import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

// GET /api/runs - list runs for org (workflow runs)
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const runType = searchParams.get("runType");
    const dealId = searchParams.get("dealId");
    const jurisdictionId = searchParams.get("jurisdictionId");
    const limitRaw = searchParams.get("limit");

    return NextResponse.json({
      runs: await listRuns(auth.orgId, {
        status,
        runType,
        dealId,
        jurisdictionId,
        limit: limitRaw ? Number(limitRaw) : null,
      }),
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.runs", method: "GET" },
    });
    console.error("Error fetching runs:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}
