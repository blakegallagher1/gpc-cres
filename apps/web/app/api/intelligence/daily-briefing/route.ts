import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { DailyBriefingService } from "@/lib/services/daily-briefing.service";

const service = new DailyBriefingService();

// GET /api/intelligence/daily-briefing
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefing = await service.generate(auth.orgId);
    return NextResponse.json(briefing);
  } catch (error) {
    console.error("Error generating daily briefing:", error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
