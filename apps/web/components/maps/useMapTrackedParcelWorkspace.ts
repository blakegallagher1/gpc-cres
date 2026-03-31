"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readMapTrackedParcels,
  removeTrackedParcel,
  syncTrackedParcelsWithVisible,
  updateTrackedParcel,
  upsertTrackedParcels,
  writeMapTrackedParcels,
  type MapTrackedParcel,
  type MapTrackedParcelDraft,
  type MapTrackedParcelStatus,
} from "./mapOperatorNotebook";
import type { MapParcel } from "./types";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WorkspaceAiOutputDraft {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
  payload?: Record<string, unknown>;
}

type UseMapTrackedParcelWorkspaceArgs = {
  activeParcels: MapParcel[];
  selectedParcelIds: string[];
  polygon: number[][][] | null;
  aiOutputs: WorkspaceAiOutputDraft[];
  activeOverlayKeys: string[];
};

type UseMapTrackedParcelWorkspaceResult = {
  trackedParcels: MapTrackedParcel[];
  trackedParcelsHydrated: boolean;
  saveTrackedSelection: (draft: MapTrackedParcelDraft) => void;
  removeTrackedSelection: (parcelId: string) => void;
  updateTrackedSelectionStatus: (
    parcelId: string,
    status: MapTrackedParcelStatus,
  ) => void;
};

function buildActiveParcelIndex(activeParcels: MapParcel[]): Map<string, MapParcel> {
  const index = new Map<string, MapParcel>();

  for (const parcel of activeParcels) {
    for (const key of [parcel.id, parcel.parcelId]) {
      const normalizedKey = normalizeParcelId(key);
      if (!normalizedKey) continue;
      index.set(normalizedKey, parcel);
    }
  }

  return index;
}

function sanitizeSelectedParcelIds(
  selectedParcelIds: string[],
  activeParcelsById: Map<string, MapParcel>,
): string[] {
  return Array.from(
    new Set(
      selectedParcelIds
        .map((parcelId) => normalizeParcelId(parcelId) ?? parcelId)
        .map((parcelId) => activeParcelsById.get(parcelId)?.parcelId ?? parcelId),
    ),
  );
}

function canonicalizeTrackedParcels(
  trackedParcels: MapTrackedParcel[],
  activeParcelsById: Map<string, MapParcel>,
): MapTrackedParcel[] {
  const byParcelId = new Map<string, MapTrackedParcel>();

  for (const trackedParcel of trackedParcels) {
    const canonicalParcelId =
      activeParcelsById.get(normalizeParcelId(trackedParcel.parcelId) ?? trackedParcel.parcelId)
        ?.parcelId ?? normalizeParcelId(trackedParcel.parcelId) ?? trackedParcel.parcelId;
    byParcelId.set(canonicalParcelId, {
      ...trackedParcel,
      parcelId: canonicalParcelId,
    });
  }

  return Array.from(byParcelId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function sanitizeAiOutputs(aiOutputs: WorkspaceAiOutputDraft[]) {
  return aiOutputs.map((output) => ({
    ...(UUID_PATTERN.test(output.id) ? { id: output.id } : {}),
    title: output.title,
    createdAt: output.createdAt,
    summary: output.summary,
    payload: output.payload ?? {},
  }));
}

export function useMapTrackedParcelWorkspace({
  activeParcels,
  selectedParcelIds,
  polygon,
  aiOutputs,
  activeOverlayKeys,
}: UseMapTrackedParcelWorkspaceArgs): UseMapTrackedParcelWorkspaceResult {
  const [trackedParcels, setTrackedParcels] = useState<MapTrackedParcel[]>([]);
  const [trackedParcelsHydrated, setTrackedParcelsHydrated] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let active = true;

    void fetch("/api/map/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Workspace load failed with ${response.status}`);
        }

        const payload = (await response.json()) as {
          workspace?: {
            id?: string;
            trackedParcels?: MapTrackedParcel[];
          };
        };

        if (!active) {
          return;
        }

        setWorkspaceId(payload.workspace?.id ?? null);
        setTrackedParcels(
          Array.isArray(payload.workspace?.trackedParcels)
            ? payload.workspace.trackedParcels
            : [],
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setTrackedParcels(readMapTrackedParcels(window.localStorage));
      })
      .finally(() => {
        if (active) {
          setTrackedParcelsHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!trackedParcelsHydrated) {
      return;
    }

    setTrackedParcels((current) => syncTrackedParcelsWithVisible(current, activeParcels));
  }, [activeParcels, trackedParcelsHydrated]);

  useEffect(() => {
    if (typeof window === "undefined" || !trackedParcelsHydrated) {
      return;
    }

    writeMapTrackedParcels(window.localStorage, trackedParcels);
  }, [trackedParcels, trackedParcelsHydrated]);

  const persistWorkspace = useCallback(
    async (nextTrackedParcels: MapTrackedParcel[]) => {
      setTrackedParcels(nextTrackedParcels);

      if (typeof window !== "undefined") {
        writeMapTrackedParcels(window.localStorage, nextTrackedParcels);
      }

      const activeParcelsById = buildActiveParcelIndex(activeParcels);
      const normalizedTrackedParcels = canonicalizeTrackedParcels(
        nextTrackedParcels,
        activeParcelsById,
      );
      const normalizedSelectedParcelIds = sanitizeSelectedParcelIds(
        selectedParcelIds,
        activeParcelsById,
      );
      const workspaceParcelIds = Array.from(
        new Set([
          ...normalizedSelectedParcelIds,
          ...normalizedTrackedParcels.map((parcel) => parcel.parcelId),
        ]),
      );
      const workspaceParcels = workspaceParcelIds
        .map((parcelId) => activeParcelsById.get(parcelId) ?? null)
        .filter((parcel): parcel is MapParcel => parcel != null)
        .map((parcel) => ({
          parcelId: parcel.parcelId,
          address: parcel.address,
          owner: parcel.owner ?? null,
          acreage: parcel.acreage ?? null,
          lat: parcel.lat,
          lng: parcel.lng,
          currentZoning: parcel.currentZoning ?? null,
          floodZone: parcel.floodZone ?? null,
        }));

      try {
        setTrackedParcels(normalizedTrackedParcels);

        if (typeof window !== "undefined") {
          writeMapTrackedParcels(window.localStorage, normalizedTrackedParcels);
        }

        const response = await fetch("/api/map/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            polygon,
            selectedParcelIds: normalizedSelectedParcelIds,
            trackedParcels: normalizedTrackedParcels,
            workspaceParcels,
            aiOutputs: sanitizeAiOutputs(aiOutputs),
            overlayState: Object.fromEntries(
              activeOverlayKeys.map((key) => [key, true]),
            ),
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          workspace?: {
            id?: string;
            trackedParcels?: MapTrackedParcel[];
          };
        };

        setWorkspaceId(payload.workspace?.id ?? workspaceId);
        if (Array.isArray(payload.workspace?.trackedParcels)) {
          setTrackedParcels(payload.workspace.trackedParcels);
        }
      } catch {
        // Keep the optimistic local state when the shared workspace call fails.
      }
    },
    [
      activeOverlayKeys,
      activeParcels,
      aiOutputs,
      polygon,
      selectedParcelIds,
      workspaceId,
    ],
  );

  const saveTrackedSelection = useCallback(
    (draft: MapTrackedParcelDraft) => {
      const activeParcelsById = buildActiveParcelIndex(activeParcels);
      const selection = selectedParcelIds
        .map((parcelId) => activeParcelsById.get(parcelId) ?? null)
        .filter((parcel): parcel is MapParcel => Boolean(parcel));

      const nextTrackedParcels = upsertTrackedParcels(trackedParcels, selection, draft);
      void persistWorkspace(nextTrackedParcels);
    },
    [activeParcels, persistWorkspace, selectedParcelIds, trackedParcels],
  );

  const removeTrackedSelection = useCallback((parcelId: string) => {
    void persistWorkspace(removeTrackedParcel(trackedParcels, parcelId));
  }, [persistWorkspace, trackedParcels]);

  const updateTrackedSelectionStatus = useCallback(
    (parcelId: string, status: MapTrackedParcelStatus) => {
      void persistWorkspace(updateTrackedParcel(trackedParcels, parcelId, { status }));
    },
    [persistWorkspace, trackedParcels],
  );

  return {
    trackedParcels,
    trackedParcelsHydrated,
    saveTrackedSelection,
    removeTrackedSelection,
    updateTrackedSelectionStatus,
  };
}
