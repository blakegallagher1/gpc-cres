import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  CreateParcelSetRequestSchema,
  ParcelSetService,
} from "@gpc/server/services/parcel-set.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

const parcelSetService = new ParcelSetService();

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = CreateParcelSetRequestSchema.parse(await request.json());
    const parcelSet = await parcelSetService.createParcelSet({
      orgId: auth.orgId,
      ...payload,
    });

    return NextResponse.json({ parcelSet }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.parcel-sets", method: "POST" },
    });

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create parcel set" },
      { status: 500 },
    );
  }
}
