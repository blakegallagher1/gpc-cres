import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { listUserPreferences } from "@/lib/services/preferenceService";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (shouldUseAppDatabaseDevFallback()) {
    return NextResponse.json({ preferences: [], degraded: true });
  }

  try {
    const preferences = await listUserPreferences(auth.orgId, auth.userId);
    return NextResponse.json({ preferences });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.preferences", method: "GET" },
    });
    console.error("[preferences.get]", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 },
    );
  }
}
