import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
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
    console.error("Automation events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch automation events" },
      { status: 500 }
    );
  }
}
