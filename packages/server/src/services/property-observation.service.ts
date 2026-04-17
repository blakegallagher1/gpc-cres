import "server-only";

import { normalizeAddress } from "./entity-resolution.service";
import { replaceKnowledgeEntry } from "../search/knowledge-base.service";

export type PropertyObservationType = "parcel_lookup" | "prospect_match";

export type PropertyObservationInput = {
  orgId: string;
  observationType: PropertyObservationType;
  parcelId: string;
  address: string;
  parish?: string | null;
  owner?: string | null;
  zoning?: string | null;
  floodZone?: string | null;
  acreage?: number | null;
  lat?: number | null;
  lng?: number | null;
  sourceRoute: string;
};

type PropertyObservationResult = {
  captured: number;
};

type NormalizedPropertyObservation = Omit<
  PropertyObservationInput,
  | "parcelId"
  | "address"
  | "parish"
  | "owner"
  | "zoning"
  | "floodZone"
  | "acreage"
  | "lat"
  | "lng"
> & {
  parcelId: string | null;
  address: string | null;
  parish: string | null;
  owner: string | null;
  zoning: string | null;
  floodZone: string | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPropertyObservationText(input: PropertyObservationInput): string {
  const lines = [
    `Observation type: ${input.observationType}`,
    `Parcel ID: ${input.parcelId}`,
    `Address: ${input.address}`,
  ];

  if (input.parish) lines.push(`Parish: ${input.parish}`);
  if (input.owner) lines.push(`Owner: ${input.owner}`);
  if (input.zoning) lines.push(`Zoning: ${input.zoning}`);
  if (input.floodZone) lines.push(`Flood zone: ${input.floodZone}`);
  if (typeof input.acreage === "number") lines.push(`Acreage: ${input.acreage}`);
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    lines.push(`Coordinates: ${input.lat}, ${input.lng}`);
  }

  return lines.join("\n");
}

function buildObservationSourceId(input: PropertyObservationInput): string {
  return `property_observation:${input.observationType}:${input.parcelId}`;
}

export async function capturePropertyObservations(
  observations: PropertyObservationInput[],
): Promise<PropertyObservationResult> {
  const validObservations = observations
    .map<NormalizedPropertyObservation>((observation) => ({
      ...observation,
      parcelId: normalizeString(observation.parcelId),
      address: normalizeString(observation.address),
      parish: normalizeString(observation.parish),
      owner: normalizeString(observation.owner),
      zoning: normalizeString(observation.zoning),
      floodZone: normalizeString(observation.floodZone),
      acreage: normalizeNumber(observation.acreage),
      lat: normalizeNumber(observation.lat),
      lng: normalizeNumber(observation.lng),
    }))
    .filter(
      (
        observation,
      ): observation is NormalizedPropertyObservation & {
        parcelId: string;
        address: string;
      } => Boolean(observation.parcelId && observation.address),
    );

  await Promise.all(
    validObservations.slice(0, 25).map(async (observation) => {
      await replaceKnowledgeEntry(
        observation.orgId,
        "agent_analysis",
        buildObservationSourceId(observation),
        buildPropertyObservationText(observation),
        {
          entityType: "property",
          parcelId: observation.parcelId,
          canonicalAddress: normalizeAddress(observation.address),
          observationType: observation.observationType,
          parish: observation.parish,
          owner: observation.owner,
          zoning: observation.zoning,
          floodZone: observation.floodZone,
          acreage: observation.acreage,
          lat: observation.lat,
          lng: observation.lng,
          sourceRoute: observation.sourceRoute,
        },
      );
    }),
  );

  return { captured: validObservations.length };
}
