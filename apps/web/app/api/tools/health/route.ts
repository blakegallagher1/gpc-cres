import { NextRequest, NextResponse } from "next/server";
import { getToolHealth } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ tools: await getToolHealth(auth.orgId) });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.tools.health", method: "GET" },
    });
    console.error("[tools.health]", error);
    return NextResponse.json(
      { error: "Failed to load tool health metrics" },
      { status: 500 },
    );
  }
}
