import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDebtMaturityWall } from "@/lib/services/portfolioAnalytics.service";
import {
  EMPTY_DEBT_MATURITY_RESPONSE,
  isSchemaDriftError,
} from "@/lib/api/prismaSchemaFallback";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const maturityWall = await getDebtMaturityWall(auth.orgId);
    return NextResponse.json(maturityWall);
  } catch (error) {
    console.error("Debt maturity analysis error:", error);
    if (isSchemaDriftError(error)) {
      return NextResponse.json(EMPTY_DEBT_MATURITY_RESPONSE);
    }
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.debt-maturity", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to compute debt maturity wall" },
      { status: 500 },
    );
  }
}
