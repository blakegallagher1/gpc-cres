import { NextRequest, NextResponse } from "next/server";
import { getIntelligenceDeadlinesForOrg } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getIntelligenceDeadlinesForOrg(auth.orgId));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.intelligence.deadlines", method: "GET" },
    });
    console.error("[api/intelligence/deadlines]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
