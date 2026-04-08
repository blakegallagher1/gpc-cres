import { NextRequest, NextResponse } from "next/server";
import { getWealthSummary } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await getWealthSummary(auth.orgId);
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.wealth.summary", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to compute summary" }, { status: 500 });
  }
}
