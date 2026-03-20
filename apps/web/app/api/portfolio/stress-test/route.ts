import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getPortfolioStressTest } from "@/lib/services/portfolioAnalytics.service";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scenario } = body;

    if (!scenario?.name) {
      return NextResponse.json(
        { error: "scenario with name is required" },
        { status: 400 }
      );
    }

    const result = await getPortfolioStressTest(auth.orgId, scenario);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.stress-test", method: "POST" },
    });
    console.error("Stress test error:", error);
    return NextResponse.json(
      { error: "Failed to run portfolio stress test" },
      { status: 500 }
    );
  }
}
