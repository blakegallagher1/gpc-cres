import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { listStageHistory } from "@gpc/server";
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

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(200, Math.max(1, Number.parseInt(limitRaw, 10))) : 50;

  try {
    const history = await listStageHistory(auth.orgId, parsed.data.id, limit);
    return NextResponse.json({ history });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.stage-history", method: "GET" },
    });
    return NextResponse.json({ error: "Failed to load stage history" }, { status: 500 });
  }
}
