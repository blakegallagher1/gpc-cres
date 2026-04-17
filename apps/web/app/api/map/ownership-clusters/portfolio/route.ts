import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { lookupOwnerPortfolio } from "@gpc/server/services/owner-clustering.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export const runtime = "nodejs";

const querySchema = z.object({
  ownerName: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = {
    ownerName: request.nextUrl.searchParams.get("ownerName") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  };

  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid query", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const portfolio = await lookupOwnerPortfolio({
      ownerName: parsed.ownerName,
      limit: parsed.limit,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });
    return NextResponse.json({ portfolio });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.ownership-clusters.portfolio", method: "GET" },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to lookup portfolio" },
      { status: 502 },
    );
  }
}
