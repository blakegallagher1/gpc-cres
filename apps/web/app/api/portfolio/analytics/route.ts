import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getPortfolioSummary } from "@/lib/services/portfolioAnalytics.service";
import {
  EMPTY_PORTFOLIO_ANALYTICS_RESPONSE,
  isSchemaDriftError,
} from "@/lib/api/prismaSchemaFallback";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getPortfolioSummary(auth.orgId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Portfolio analytics error:", error);
    if (isSchemaDriftError(error)) {
      return NextResponse.json(EMPTY_PORTFOLIO_ANALYTICS_RESPONSE);
    }
    return NextResponse.json(
      { error: "Failed to compute portfolio analytics" },
      { status: 500 }
    );
  }
}
