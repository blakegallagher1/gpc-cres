import { NextRequest, NextResponse } from "next/server";
import {
  AssetCreateRequestSchema,
  AssetListResponseSchema,
  AssetResponseSchema,
} from "@entitlement-os/shared";

import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  toIsoString,
  toNumberOrNull,
} from "@/app/api/_lib/opportunityPhase3";

function normalizeNullableNumberLike(
  value: unknown,
): number | string | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return null;
}

function normalizeAssetCreateBody(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : "",
    address: typeof body.address === "string" ? body.address : null,
    city: typeof body.city === "string" ? body.city : null,
    state: typeof body.state === "string" ? body.state : null,
    zip: typeof body.zip === "string" ? body.zip : null,
    county: typeof body.county === "string" ? body.county : null,
    parcelNumber:
      typeof body.parcelNumber === "string" ? body.parcelNumber : null,
    assetClass: typeof body.assetClass === "string" ? body.assetClass : null,
    assetSubtype:
      typeof body.assetSubtype === "string" ? body.assetSubtype : null,
    lat: normalizeNullableNumberLike(body.lat),
    lng: normalizeNullableNumberLike(body.lng),
    acreage: normalizeNullableNumberLike(body.acreage),
    sfGross: normalizeNullableNumberLike(body.sfGross),
    sfNet: normalizeNullableNumberLike(body.sfNet),
    yearBuilt:
      typeof body.yearBuilt === "number" ? body.yearBuilt : null,
    zoning: typeof body.zoning === "string" ? body.zoning : null,
    zoningDescription:
      typeof body.zoningDescription === "string"
        ? body.zoningDescription
        : null,
  };
}

function serializeAsset(asset: {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  parcelNumber: string | null;
  assetClass: string | null;
  assetSubtype: string | null;
  lat: { toString(): string } | number | null;
  lng: { toString(): string } | number | null;
  acreage: { toString(): string } | number | null;
  sfGross: { toString(): string } | number | null;
  sfNet: { toString(): string } | number | null;
  yearBuilt: number | null;
  zoning: string | null;
  zoningDescription: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) {
  return {
    id: asset.id,
    orgId: asset.orgId,
    name: asset.name,
    address: asset.address,
    city: asset.city,
    state: asset.state,
    zip: asset.zip,
    county: asset.county,
    parcelNumber: asset.parcelNumber,
    assetClass: asset.assetClass,
    assetSubtype: asset.assetSubtype,
    lat: toNumberOrNull(
      typeof asset.lat === "number" ? asset.lat : asset.lat?.toString(),
    ),
    lng: toNumberOrNull(
      typeof asset.lng === "number" ? asset.lng : asset.lng?.toString(),
    ),
    acreage: toNumberOrNull(
      typeof asset.acreage === "number"
        ? asset.acreage
        : asset.acreage?.toString(),
    ),
    sfGross: toNumberOrNull(
      typeof asset.sfGross === "number"
        ? asset.sfGross
        : asset.sfGross?.toString(),
    ),
    sfNet: toNumberOrNull(
      typeof asset.sfNet === "number" ? asset.sfNet : asset.sfNet?.toString(),
    ),
    yearBuilt: asset.yearBuilt,
    zoning: asset.zoning,
    zoningDescription: asset.zoningDescription,
    createdAt: toIsoString(asset.createdAt),
    updatedAt: toIsoString(asset.updatedAt),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assets = await prisma.asset.findMany({
      where: { orgId: auth.orgId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(
      AssetListResponseSchema.parse({
        assets: assets.map(serializeAsset),
      }),
    );
  } catch (error) {
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
    const parsed = AssetCreateRequestSchema.safeParse(
      normalizeAssetCreateBody(rawBody),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }

    if (!parsed.data.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    const asset = await prisma.asset.create({
      data: {
        orgId: auth.orgId,
        name: parsed.data.name,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state,
        zip: parsed.data.zip,
        county: parsed.data.county,
        parcelNumber: parsed.data.parcelNumber,
        assetClass: parsed.data.assetClass,
        assetSubtype: parsed.data.assetSubtype,
        lat: toNumberOrNull(parsed.data.lat),
        lng: toNumberOrNull(parsed.data.lng),
        acreage: toNumberOrNull(parsed.data.acreage),
        sfGross: toNumberOrNull(parsed.data.sfGross),
        sfNet: toNumberOrNull(parsed.data.sfNet),
        yearBuilt: parsed.data.yearBuilt,
        zoning: parsed.data.zoning,
        zoningDescription: parsed.data.zoningDescription,
      },
    });

    return NextResponse.json(
      AssetResponseSchema.parse({ asset: serializeAsset(asset) }),
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating asset:", error);
    return NextResponse.json(
      { error: "Failed to create asset" },
      { status: 500 },
    );
  }
}
