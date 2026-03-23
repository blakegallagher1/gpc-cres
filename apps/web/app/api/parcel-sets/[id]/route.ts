import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ParcelSetService } from "@gpc/server/services/parcel-set.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

const parcelSetService = new ParcelSetService();
const ParamsSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = ParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid parcel set id" }, { status: 400 });
    }

    const parcelSet = await parcelSetService.getParcelSetById(
      auth.orgId,
      parsedParams.data.id,
    );

    if (!parcelSet) {
      return NextResponse.json({ error: "Parcel set not found" }, { status: 404 });
    }

    return NextResponse.json({ parcelSet });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.parcel-sets.[id]", method: "GET" },
    });

    return NextResponse.json(
      { error: "Failed to fetch parcel set" },
      { status: 500 },
    );
  }
}
