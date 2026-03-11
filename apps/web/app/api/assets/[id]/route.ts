import { NextRequest, NextResponse } from "next/server";
import {
  AssetDetailResponseSchema,
  AssetResponseSchema,
  AssetUpdateRequestSchema,
} from "@entitlement-os/shared";

import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  hasOwn,
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

function normalizeAssetUpdateBody(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : null,
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
    const asset = await prisma.asset.findFirst({
      where: { id, orgId: auth.orgId },
      include: {
        dealAssets: {
          orderBy: { createdAt: "asc" },
          include: {
            deal: {
              select: {
                id: true,
                name: true,
                sku: true,
                status: true,
                legacySku: true,
                legacyStatus: true,
                assetClass: true,
                strategy: true,
                workflowTemplateKey: true,
                currentStageKey: true,
              },
            },
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(
      AssetDetailResponseSchema.parse({
        asset: {
          ...serializeAsset(asset),
          dealAssociations: asset.dealAssets.map((dealAsset) => ({
            id: dealAsset.id,
            orgId: dealAsset.orgId,
            dealId: dealAsset.dealId,
            assetId: dealAsset.assetId,
            role: dealAsset.role,
            createdAt: toIsoString(dealAsset.createdAt),
            deal: {
              id: dealAsset.deal.id,
              name: dealAsset.deal.name,
              sku: dealAsset.deal.sku,
              status: dealAsset.deal.status,
              legacySku: dealAsset.deal.legacySku,
              legacyStatus: dealAsset.deal.legacyStatus,
              assetClass: dealAsset.deal.assetClass,
              strategy: dealAsset.deal.strategy,
              workflowTemplateKey: dealAsset.deal.workflowTemplateKey,
              currentStageKey: dealAsset.deal.currentStageKey,
            },
          })),
        },
      }),
    );
  } catch (error) {
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
    const existing = await prisma.asset.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const rawBody = (await request.json()) as Record<string, unknown>;
    const parsed = AssetUpdateRequestSchema.safeParse(
      normalizeAssetUpdateBody(rawBody),
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

    const data: Record<string, unknown> = {};
    const fields = [
      "name",
      "address",
      "city",
      "state",
      "zip",
      "county",
      "parcelNumber",
      "assetClass",
      "assetSubtype",
      "lat",
      "lng",
      "acreage",
      "sfGross",
      "sfNet",
      "yearBuilt",
      "zoning",
      "zoningDescription",
    ] as const;

    for (const field of fields) {
      if (!hasOwn(rawBody, field)) {
        continue;
      }

      if (field === "name" && (!parsed.data.name || !parsed.data.name.trim())) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 },
        );
      }

      if (
        field === "lat" ||
        field === "lng" ||
        field === "acreage" ||
        field === "sfGross" ||
        field === "sfNet"
      ) {
        data[field] = toNumberOrNull(parsed.data[field]);
        continue;
      }

      data[field] = parsed.data[field];
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided" },
        { status: 400 },
      );
    }

    const asset = await prisma.asset.update({
      where: { id },
      data,
    });

    return NextResponse.json(
      AssetResponseSchema.parse({
        asset: serializeAsset(asset),
      }),
    );
  } catch (error) {
    console.error("Error updating asset:", error);
    return NextResponse.json(
      { error: "Failed to update asset" },
      { status: 500 },
    );
  }
}
