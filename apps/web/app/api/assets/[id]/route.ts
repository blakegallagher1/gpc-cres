import { NextRequest, NextResponse } from "next/server";
import {
  AssetDetailResponseSchema,
  AssetResponseSchema,
} from "@entitlement-os/shared";
import {
  AssetNotFoundError,
  AssetValidationError,
  getAssetDetail,
  updateAsset,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const asset = await getAssetDetail(auth.orgId, id);

    return NextResponse.json(
      AssetDetailResponseSchema.parse({ asset }),
    );
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.assets", method: "GET" },
    });
    console.error("Error fetching asset:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const rawBody = (await request.json()) as Record<string, unknown>;
    const asset = await updateAsset(auth.orgId, id, rawBody);

    return NextResponse.json(
      AssetResponseSchema.parse({ asset }),
    );
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (error instanceof AssetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.assets", method: "PATCH" },
    });
    console.error("Error updating asset:", error);
    return NextResponse.json(
      { error: "Failed to update asset" },
      { status: 500 },
    );
  }
}
