import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDealVelocityAnalytics } from "@/lib/services/portfolioAnalytics.service";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const velocity = await getDealVelocityAnalytics(auth.orgId);
    return NextResponse.json(velocity);
  } catch (error) {
    console.error("Deal velocity analytics error:", error);
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.velocity", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to compute deal velocity analytics" },
      { status: 500 },
    );
  }
}

