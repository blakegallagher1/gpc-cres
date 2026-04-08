import { NextRequest, NextResponse } from "next/server";
import {
  AssetListResponseSchema,
  AssetResponseSchema,
} from "@entitlement-os/shared";
import {
  AssetValidationError,
  createAsset,
  listAssets,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      AssetListResponseSchema.parse({
        assets: await listAssets(auth.orgId),
      }),
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.assets", method: "GET" },
    });
    console.error("Error fetching assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assets" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = (await request.json()) as Record<string, unknown>;
    const asset = await createAsset(auth.orgId, rawBody);

    return NextResponse.json(
      AssetResponseSchema.parse({ asset }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.assets", method: "POST" },
    });
    console.error("Error creating asset:", error);
    return NextResponse.json(
      { error: "Failed to create asset" },
      { status: 500 },
    );
  }
}
