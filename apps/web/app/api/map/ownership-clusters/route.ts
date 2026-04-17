import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { listOwnerClustersInBbox } from "@gpc/server/services/owner-clustering.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export const runtime = "nodejs";

const bodySchema = z.object({
  bounds: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }),
  minParcelCount: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const clusters = await listOwnerClustersInBbox({
      bounds: payload.bounds,
      minParcelCount: payload.minParcelCount,
      limit: payload.limit,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });
    return NextResponse.json({ clusters, count: clusters.length });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.ownership-clusters", method: "POST" },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute clusters" },
      { status: 502 },
    );
  }
}
