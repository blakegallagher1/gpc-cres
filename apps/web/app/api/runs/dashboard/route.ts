import { NextRequest, NextResponse } from "next/server";
import { buildRunDashboard } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await buildRunDashboard(auth.orgId));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.runs.dashboard", method: "GET" },
    });
    console.error("Error building run dashboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch run dashboard" },
      { status: 500 },
    );
  }
}
