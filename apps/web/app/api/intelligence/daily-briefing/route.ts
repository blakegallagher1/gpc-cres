import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { DailyBriefingService } from "@/lib/services/daily-briefing.service";
import * as Sentry from "@sentry/nextjs";

const service = new DailyBriefingService();

// GET /api/intelligence/daily-briefing
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefing = await service.generate(auth.orgId);
    return NextResponse.json(briefing);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.intelligence.daily-briefing", method: "GET" },
    });
    console.error("Error generating daily briefing:", error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
