import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getConcentrationAnalysis } from "@/lib/services/portfolioAnalytics.service";
import {
  EMPTY_CONCENTRATION_RESPONSE,
  isSchemaDriftError,
} from "@/lib/api/prismaSchemaFallback";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const concentration = await getConcentrationAnalysis(auth.orgId);
    return NextResponse.json(concentration);
  } catch (error) {
    console.error("Concentration analysis error:", error);
    if (isSchemaDriftError(error)) {
      return NextResponse.json(EMPTY_CONCENTRATION_RESPONSE);
    }
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.concentration", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to compute concentration analysis" },
      { status: 500 }
    );
  }
}
