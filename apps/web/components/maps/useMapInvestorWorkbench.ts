"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { MapTrackedParcel } from "./mapOperatorNotebook";
import type { MapHudState, MapParcel } from "./types";
import {
  SWR_OPTIONS,
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
  buildQueryString,
  collectContextParcels,
  fetchWorkbenchResource,
  resolveWorkbenchSnapshots,
  workbenchSchemas,
} from "./mapInvestorWorkbench.builders";
import type { MapInvestorWorkbench } from "./mapInvestorWorkbench.types";

type UseMapInvestorWorkbenchArgs = {
  activeParcels: MapParcel[];
  selectedParcels: MapParcel[];
  trackedParcels: MapTrackedParcel[];
  hudState: MapHudState;
  polygon: number[][][] | null;
  resultCount: number;
};

export type {
  MapAssemblageSnapshot,
  MapCompsSnapshot,
  MapInvestorWorkbench,
  MapMarketOverlaySnapshot,
  MapOwnershipSnapshot,
  MapWorkbenchResourceKind,
  MapWorkbenchResourceStatus,
  MapWorkspaceSnapshot,
} from "./mapInvestorWorkbench.types";

export {
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
} from "./mapInvestorWorkbench.builders";

export function useMapInvestorWorkbench({
  activeParcels,
  selectedParcels,
  trackedParcels,
  hudState,
  polygon,
  resultCount,
}: UseMapInvestorWorkbenchArgs): MapInvestorWorkbench {
  const contextParcels = useMemo(
    () => collectContextParcels(activeParcels, selectedParcels, trackedParcels),
    [activeParcels, selectedParcels, trackedParcels],
  );
  const query = useMemo(
    () => buildQueryString(contextParcels.map((parcel) => parcel.parcelId), polygon),
    [contextParcels, polygon],
  );
  const hasContext = contextParcels.length > 0 || Boolean(polygon);

  const workspaceRequest = useSWR(
    hasContext ? `/api/map/workspaces/active?${query}` : null,
    (endpoint: string) => fetchWorkbenchResource(endpoint, workbenchSchemas.workspace),
    SWR_OPTIONS,
  );
  const assemblageRequest = useSWR(
    contextParcels.length > 1 ? `/api/map/assemblage?${query}` : null,
    (endpoint: string) => fetchWorkbenchResource(endpoint, workbenchSchemas.assemblage),
    SWR_OPTIONS,
  );
  const ownershipRequest = useSWR(
    contextParcels.length > 0 ? `/api/map/ownership-outreach?${query}` : null,
    (endpoint: string) => fetchWorkbenchResource(endpoint, workbenchSchemas.ownership),
    SWR_OPTIONS,
  );
  const compsRequest = useSWR(
    contextParcels.length > 0 ? `/api/map/comps/intelligence?${query}` : null,
    (endpoint: string) => fetchWorkbenchResource(endpoint, workbenchSchemas.comps),
    SWR_OPTIONS,
  );
  const marketOverlayRequest = useSWR(
    hasContext ? `/api/map/market-overlays?${query}` : null,
    (endpoint: string) => fetchWorkbenchResource(endpoint, workbenchSchemas.marketOverlays),
    SWR_OPTIONS,
  );

  return useMemo(
    () =>
      resolveWorkbenchSnapshots({
        hasContext,
        contextParcels,
        selectedParcels,
        trackedParcels,
        polygon,
        resultCount,
        hudState,
        workspaceData: workspaceRequest.data,
        assemblageData: assemblageRequest.data,
        ownershipData: ownershipRequest.data,
        compsData: compsRequest.data,
        marketOverlayData: marketOverlayRequest.data,
        isLoading:
          workspaceRequest.isLoading ||
          assemblageRequest.isLoading ||
          ownershipRequest.isLoading ||
          compsRequest.isLoading ||
          marketOverlayRequest.isLoading,
      }),
    [
      assemblageRequest.data,
      assemblageRequest.isLoading,
      compsRequest.data,
      compsRequest.isLoading,
      contextParcels,
      hasContext,
      hudState,
      marketOverlayRequest.data,
      marketOverlayRequest.isLoading,
      ownershipRequest.data,
      ownershipRequest.isLoading,
      polygon,
      resultCount,
      selectedParcels,
      trackedParcels,
      workspaceRequest.data,
      workspaceRequest.isLoading,
    ],
  );
}
