import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { get1031Matches } from "@/lib/services/portfolioAnalytics.service";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await params;

  try {
    const result = await get1031Matches(auth.orgId, dealId);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.portfolio.1031-matches", method: "GET" },
    });
    console.error("1031 match error:", error);
    return NextResponse.json(
      { error: "Failed to find 1031 exchange matches" },
      { status: 500 }
    );
  }
}
