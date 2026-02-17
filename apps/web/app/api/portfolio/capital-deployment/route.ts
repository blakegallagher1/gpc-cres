import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getCapitalDeploymentAnalytics } from "@/lib/services/portfolioAnalytics.service";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deployment = await getCapitalDeploymentAnalytics(auth.orgId);
    return NextResponse.json(deployment);
  } catch (error) {
    console.error("Capital deployment analytics error:", error);
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.capital-deployment", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to compute capital deployment analytics" },
      { status: 500 },
    );
  }
}

