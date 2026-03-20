import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getCapitalAllocation } from "@/lib/services/portfolioAnalytics.service";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { availableEquity, maxDeals } = body;

    if (typeof availableEquity !== "number" || availableEquity <= 0) {
      return NextResponse.json(
        { error: "availableEquity must be a positive number" },
        { status: 400 }
      );
    }

    const result = await getCapitalAllocation(
      auth.orgId,
      availableEquity,
      maxDeals
    );
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.optimize", method: "POST" },
    });
    console.error("Capital allocation error:", error);
    return NextResponse.json(
      { error: "Failed to compute capital allocation" },
      { status: 500 }
    );
  }
}
