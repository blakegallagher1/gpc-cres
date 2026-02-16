import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import {
  getRecentEvents,
  getAutomationStats,
  getHandlerHealth,
  getFailedEvents,
} from "@/lib/services/automationEvent.service";

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "feed";
  const dealId = searchParams.get("dealId") ?? undefined;

  const emptyPayload = {
    stats: {
      totalToday: 0,
      successRateToday: 100,
      avgDurationMs: null,
      failuresRequiringAttention: 0,
    },
    feed: { events: [] },
    health: { handlers: [] },
    failures: { events: [] },
  };

  try {
    switch (view) {
      case "feed": {
        const events = await getRecentEvents(50, dealId);
        return NextResponse.json({ events });
      }
      case "stats": {
        const stats = await getAutomationStats();
        return NextResponse.json(stats);
      }
      case "health": {
        const health = await getHandlerHealth();
        return NextResponse.json({ handlers: health });
      }
      case "failures": {
        const failures = await getFailedEvents();
        return NextResponse.json({ events: failures });
      }
      default:
        return NextResponse.json(
          { error: "Invalid view parameter" },
          { status: 400 }
        );
    }
  } catch (error) {
    if (isSchemaDriftError(error)) {
      console.warn(
        "Automation events table missing; returning empty fallback payload",
        { view }
      );
      switch (view) {
        case "feed":
          return NextResponse.json(emptyPayload.feed);
        case "stats":
          return NextResponse.json(emptyPayload.stats);
        case "health":
          return NextResponse.json(emptyPayload.health);
        case "failures":
          return NextResponse.json(emptyPayload.failures);
      }
    }

    console.error("Automation events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch automation events" },
      { status: 500 }
    );
  }
}
