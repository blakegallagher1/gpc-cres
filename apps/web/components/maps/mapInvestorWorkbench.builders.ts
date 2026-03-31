import { z } from "zod";
import type { MapTrackedParcel } from "./mapOperatorNotebook";
import type { MapParcel } from "./types";
import {
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
  buildLoadingBundle,
  buildResourceStatus,
  resolveWorkbenchSnapshots,
} from "./mapInvestorWorkbenchFallbacks";
import type { MapInvestorWorkbench } from "./mapInvestorWorkbench.types";
import {
  AssemblageSnapshotSchema,
  CompsSnapshotSchema,
  MarketOverlaySnapshotSchema,
  OwnershipSnapshotSchema,
  WorkspaceSnapshotSchema,
} from "./mapInvestorWorkbench.types";

export const SWR_OPTIONS = {
  revalidateOnFocus: false,
  dedupingInterval: 45_000,
} as const;

function trackedParcelToMapParcel(entry: MapTrackedParcel): MapParcel {
  return {
    id: entry.parcelId,
    parcelId: entry.parcelId,
    address: entry.address,
    lat: entry.lat,
    lng: entry.lng,
    acreage: entry.acreage ?? null,
    currentZoning: entry.currentZoning ?? null,
    floodZone: entry.floodZone ?? null,
    owner: null,
  };
}

export function collectContextParcels(
  activeParcels: MapParcel[],
  selectedParcels: MapParcel[],
  trackedParcels: MapTrackedParcel[],
): MapParcel[] {
  const activeById = new Map(activeParcels.map((parcel) => [parcel.id, parcel]));
  const seen = new Set<string>();
  const ordered: MapParcel[] = [];

  for (const parcel of selectedParcels) {
    if (seen.has(parcel.id)) {
      continue;
    }
    seen.add(parcel.id);
    ordered.push(parcel);
  }

  for (const entry of trackedParcels) {
    if (seen.has(entry.parcelId)) {
      continue;
    }
    seen.add(entry.parcelId);
    ordered.push(activeById.get(entry.parcelId) ?? trackedParcelToMapParcel(entry));
  }

  return ordered;
}

export function buildQueryString(
  parcelIds: string[],
  polygon: number[][][] | null,
): string {
  const params = new URLSearchParams();

  for (const parcelId of parcelIds) {
    params.append("parcelId", parcelId);
  }

  if (polygon) {
    params.set("polygon", JSON.stringify(polygon));
  }

  return params.toString();
}

export async function fetchWorkbenchResource<T>(
  endpoint: string,
  schema: z.ZodSchema<T>,
): Promise<T | null> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const workbenchSchemas = {
  assemblage: AssemblageSnapshotSchema,
  comps: CompsSnapshotSchema,
  marketOverlays: MarketOverlaySnapshotSchema,
  ownership: OwnershipSnapshotSchema,
  workspace: WorkspaceSnapshotSchema,
} as const;

export {
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
  buildLoadingBundle,
  buildResourceStatus,
  resolveWorkbenchSnapshots,
};

export type { MapInvestorWorkbench };
