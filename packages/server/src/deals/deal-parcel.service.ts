import { prisma } from "@entitlement-os/db";

import {
  getParcelEnrichmentPayload,
  searchPropertyDbMatches,
} from "../automation/enrichment";
import { DealAccessError } from "./deal-workspace.service";

type DecimalLike = { toString: () => string };

type DealScope = {
  dealId: string;
  orgId: string;
};

type ParcelCreateInput = {
  address: string;
  apn?: string | null;
  acreage?: string | number | null;
  currentZoning?: string | null;
  futureLandUse?: string | null;
  utilitiesNotes?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
};

type ParcelRecord = {
  id: string;
  orgId: string;
  dealId: string;
  address: string;
  apn: string | null;
  acreage: DecimalLike | number | null;
  currentZoning: string | null;
  futureLandUse: string | null;
  utilitiesNotes: string | null;
  floodZone: string | null;
  soilsNotes: string | null;
  wetlandsNotes: string | null;
  envNotes: string | null;
  trafficNotes: string | null;
  propertyDbId: string | null;
  lat: DecimalLike | number | null;
  lng: DecimalLike | number | null;
  createdAt: Date;
};

type ParcelScope = DealScope & {
  parcelId: string;
};

export class ParcelNotFoundError extends Error {
  constructor() {
    super("Parcel not found");
    this.name = "ParcelNotFoundError";
  }
}

function toStringValue(value: DecimalLike | number | null) {
  if (value === null) {
    return null;
  }

  return value.toString();
}

function serializeParcel(parcel: ParcelRecord) {
  return {
    id: parcel.id,
    orgId: parcel.orgId,
    dealId: parcel.dealId,
    address: parcel.address,
    apn: parcel.apn,
    acreage: toStringValue(parcel.acreage),
    currentZoning: parcel.currentZoning,
    futureLandUse: parcel.futureLandUse,
    utilitiesNotes: parcel.utilitiesNotes,
    floodZone: parcel.floodZone,
    soilsNotes: parcel.soilsNotes,
    wetlandsNotes: parcel.wetlandsNotes,
    envNotes: parcel.envNotes,
    trafficNotes: parcel.trafficNotes,
    propertyDbId: parcel.propertyDbId,
    lat: toStringValue(parcel.lat),
    lng: toStringValue(parcel.lng),
    createdAt: parcel.createdAt.toISOString(),
  };
}

async function ensureScopedDeal(scope: DealScope): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: scope.dealId, orgId: scope.orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }
}

async function getScopedParcel(scope: ParcelScope) {
  const parcel = await prisma.parcel.findFirst({
    where: {
      id: scope.parcelId,
      dealId: scope.dealId,
      deal: { orgId: scope.orgId },
    },
    include: {
      deal: { include: { jurisdiction: { select: { name: true } } } },
    },
  });

  if (!parcel) {
    throw new ParcelNotFoundError();
  }

  return parcel;
}

function parseNumericValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return typeof value === "number" ? value : Number.parseFloat(value);
}

export async function listDealParcels(scope: DealScope) {
  await ensureScopedDeal(scope);

  const parcels = await prisma.parcel.findMany({
    where: { dealId: scope.dealId },
    orderBy: { createdAt: "asc" },
  });

  return parcels.map((parcel) => serializeParcel(parcel as ParcelRecord));
}

export async function createDealParcel(
  scope: DealScope & { input: ParcelCreateInput },
) {
  await ensureScopedDeal(scope);

  const parcel = await prisma.parcel.create({
    data: {
      orgId: scope.orgId,
      dealId: scope.dealId,
      address: scope.input.address,
      apn: scope.input.apn ?? null,
      acreage: parseNumericValue(scope.input.acreage),
      currentZoning: scope.input.currentZoning ?? null,
      futureLandUse: scope.input.futureLandUse ?? null,
      utilitiesNotes: scope.input.utilitiesNotes ?? null,
      lat: parseNumericValue(scope.input.lat),
      lng: parseNumericValue(scope.input.lng),
    },
  });

  return serializeParcel(parcel as ParcelRecord);
}

export async function findDealParcelEnrichmentMatches(scope: ParcelScope) {
  const parcel = await getScopedParcel(scope);
  const matches = await searchPropertyDbMatches(
    parcel.address,
    parcel.deal?.jurisdiction?.name ?? null,
  );

  return {
    address: parcel.address,
    matches,
  };
}

export async function applyDealParcelEnrichment(
  scope: ParcelScope & { propertyDbId: string },
) {
  await getScopedParcel(scope);

  const { screening, updateData } = await getParcelEnrichmentPayload(
    scope.propertyDbId,
  );

  const parcel = await prisma.parcel.update({
    where: { id: scope.parcelId },
    data: updateData,
  });

  return {
    parcel: serializeParcel(parcel as ParcelRecord),
    screening,
  };
}
