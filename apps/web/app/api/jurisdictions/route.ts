import { NextRequest, NextResponse } from "next/server";
import { listJurisdictionSummaries } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jurisdictions = await listJurisdictionSummaries(auth.orgId, {
      logger: console,
    });

    return NextResponse.json({ jurisdictions });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.jurisdictions", method: "GET" },
    });
    console.error("Error fetching jurisdictions:", error);
    return NextResponse.json({ error: "Failed to fetch jurisdictions" }, { status: 500 });
  }
}
