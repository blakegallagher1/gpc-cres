import { prisma, type Prisma } from "@entitlement-os/db";
import {
  AssetCreateRequestSchema,
  AssetUpdateRequestSchema,
} from "@entitlement-os/shared";

type NumberLike = { toString(): string } | number | null;

export class AssetNotFoundError extends Error {
  constructor(message: string = "Asset not found") {
    super(message);
    this.name = "AssetNotFoundError";
  }
}

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetValidationError";
  }
}

type AssetRecord = {
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
  lat: NumberLike;
  lng: NumberLike;
  acreage: NumberLike;
  sfGross: NumberLike;
  sfNet: NumberLike;
  yearBuilt: number | null;
  zoning: string | null;
  zoningDescription: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function serializeAsset(asset: AssetRecord) {
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
      typeof asset.acreage === "number" ? asset.acreage : asset.acreage?.toString(),
    ),
    sfGross: toNumberOrNull(
      typeof asset.sfGross === "number" ? asset.sfGross : asset.sfGross?.toString(),
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
    yearBuilt: typeof body.yearBuilt === "number" ? body.yearBuilt : null,
    zoning: typeof body.zoning === "string" ? body.zoning : null,
    zoningDescription:
      typeof body.zoningDescription === "string" ? body.zoningDescription : null,
  };
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
    yearBuilt: typeof body.yearBuilt === "number" ? body.yearBuilt : null,
    zoning: typeof body.zoning === "string" ? body.zoning : null,
    zoningDescription:
      typeof body.zoningDescription === "string" ? body.zoningDescription : null,
  };
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateCreateBody(body: Record<string, unknown>) {
  const normalized = normalizeAssetCreateBody(body);
  const parsed = AssetCreateRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AssetValidationError(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  }
  if (!normalized.name.trim()) {
    throw new AssetValidationError("name is required");
  }
  return normalized;
}

function buildUpdateData(body: Record<string, unknown>) {
  const normalized = normalizeAssetUpdateBody(body);
  const parsed = AssetUpdateRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AssetValidationError(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
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
    if (!hasOwn(body, field)) continue;

    if (field === "name" && (!normalized.name || !normalized.name.trim())) {
      throw new AssetValidationError("name must be a non-empty string");
    }

    if (
      field === "lat" ||
      field === "lng" ||
      field === "acreage" ||
      field === "sfGross" ||
      field === "sfNet"
    ) {
      data[field] = toNumberOrNull(normalized[field]);
      continue;
    }

    if (field === "assetClass") {
      data[field] =
        normalized.assetClass == null
          ? null
          : (normalized.assetClass as Prisma.AssetCreateInput["assetClass"]);
      continue;
    }

    data[field] = normalized[field];
  }

  if (Object.keys(data).length === 0) {
    throw new AssetValidationError("No valid fields provided");
  }

  return data;
}

export async function listAssets(orgId: string) {
  const assets = await prisma.asset.findMany({
    where: { orgId },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return assets.map(serializeAsset);
}

export async function createAsset(orgId: string, body: Record<string, unknown>) {
  const parsed = validateCreateBody(body);
  const data: Prisma.AssetUncheckedCreateInput = {
    orgId,
    name: parsed.name,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    county: parsed.county,
    parcelNumber: parsed.parcelNumber,
    assetClass:
      parsed.assetClass == null
        ? null
        : (parsed.assetClass as Prisma.AssetUncheckedCreateInput["assetClass"]),
    assetSubtype: parsed.assetSubtype,
    lat: toNumberOrNull(parsed.lat),
    lng: toNumberOrNull(parsed.lng),
    acreage: toNumberOrNull(parsed.acreage),
    sfGross: toNumberOrNull(parsed.sfGross),
    sfNet: toNumberOrNull(parsed.sfNet),
    yearBuilt: parsed.yearBuilt,
    zoning: parsed.zoning,
    zoningDescription: parsed.zoningDescription,
  };
  const asset = await prisma.asset.create({
    data,
  });

  return serializeAsset(asset);
}

export async function getAssetDetail(orgId: string, id: string) {
  const asset = await prisma.asset.findFirst({
    where: { id, orgId },
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
    throw new AssetNotFoundError();
  }

  return {
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
        assetClass: dealAsset.deal.assetClass ? String(dealAsset.deal.assetClass) : null,
        strategy: dealAsset.deal.strategy ? String(dealAsset.deal.strategy) : null,
        workflowTemplateKey: dealAsset.deal.workflowTemplateKey,
        currentStageKey: dealAsset.deal.currentStageKey,
      },
    })),
  };
}

export async function updateAsset(
  orgId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const existing = await prisma.asset.findFirst({
    where: { id, orgId },
    select: { id: true },
  });

  if (!existing) {
    throw new AssetNotFoundError();
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: buildUpdateData(body),
  });

  return serializeAsset(asset);
}
