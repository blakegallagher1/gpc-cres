import { NextRequest, NextResponse } from "next/server";
import { getPortfolioSummary } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  EMPTY_PORTFOLIO_RESPONSE,
  isSchemaDriftError,
} from "@/lib/api/prismaSchemaFallback";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getPortfolioSummary(auth.orgId));
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    if (isSchemaDriftError(error)) {
      return NextResponse.json(EMPTY_PORTFOLIO_RESPONSE);
    }

    Sentry.captureException(error, {
      tags: { route: "api.portfolio", method: "GET" },
    });

    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 },
    );
  }
}
