import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getEbrBuildingPermitsFeed,
  type BuildingPermitsDesignation,
} from "@/lib/services/buildingPermits.service";

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
  designation: z
    .enum(["all", "commercial", "residential"])
    .default("all"),
  limit: z.coerce.number().int().min(10).max(100).default(25),
  permitType: z.string().trim().min(1).max(120).optional(),
  zip: z.string().regex(/^\d{5}$/).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse({
      days: searchParams.get("days") ?? undefined,
      designation: searchParams.get("designation") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      permitType: searchParams.get("permitType") ?? undefined,
      zip: searchParams.get("zip") ?? undefined,
    });

    const payload = await getEbrBuildingPermitsFeed({
      days: parsed.days,
      designation: parsed.designation as BuildingPermitsDesignation,
      limit: parsed.limit,
      permitType: parsed.permitType ?? null,
      zipCode: parsed.zip ?? null,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: err.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    console.error("[market-building-permits]", err);
    return NextResponse.json(
      { error: "Failed to fetch building permits feed" },
      { status: 500 },
    );
  }
}
