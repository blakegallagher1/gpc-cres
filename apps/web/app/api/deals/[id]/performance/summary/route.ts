import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import {
  AssetManagementAccessError,
  computeDispositionReadiness,
  getAssetPerformanceSummary,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 });
  }

  try {
    const [summary, readiness] = await Promise.all([
      getAssetPerformanceSummary(auth.orgId, parsed.data.id),
      computeDispositionReadiness(auth.orgId, parsed.data.id),
    ]);
    return NextResponse.json({ summary, readiness });
  } catch (error) {
    if (error instanceof AssetManagementAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.performance.summary", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to compute performance summary" },
      { status: 500 },
    );
  }
}
