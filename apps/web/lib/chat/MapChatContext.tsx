"use client";

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  MapContextBounds,
  MapContextGeometry,
  MapContextInput,
  MapContextSpatialSelection,
} from "@entitlement-os/shared";
import type { MapActionPayload, MapFeature } from "./mapActionTypes";

// ---------- State ----------

export interface MapChatState {
  /** Currently selected parcel IDs (shared between map clicks and chat references) */
  selectedParcelIds: string[];
  /** Basic parcel details for the currently selected parcel IDs */
  selectedParcelFeatures: MapFeature[];
  /** Features the agent has referenced in the current conversation turn */
  referencedFeatures: MapFeature[];
  /** Current map viewport center */
  center: [number, number] | null; // [lng, lat]
  /** Current map zoom level */
  zoom: number | null;
  /** Current map viewport bounds */
  viewportBounds: MapContextBounds | null;
  /** Active polygon/spatial selection, if one exists */
  spatialSelection: MapContextSpatialSelection | null;
  /** Queue of pending map actions from SSE events */
  pendingActions: MapActionPayload[];
  /** Viewport label (e.g., "Downtown Baton Rouge") */
  viewportLabel: string | null;
}

export const initialMapChatState: MapChatState = {
  selectedParcelIds: [],
  selectedParcelFeatures: [],
  referencedFeatures: [],
  center: null,
  zoom: null,
  viewportBounds: null,
  spatialSelection: null,
  pendingActions: [],
  viewportLabel: null,
};

// ---------- Actions ----------

export type MapChatAction =
  | { type: "SELECT_PARCELS"; parcelIds: string[] }
  | { type: "SET_SELECTED_PARCEL_FEATURES"; features: MapFeature[] }
  | { type: "DESELECT_ALL" }
  | { type: "TOGGLE_PARCEL"; parcelId: string }
  | {
      type: "SET_VIEWPORT";
      center: [number, number];
      zoom: number;
      bounds?: MapContextBounds | null;
      label?: string;
    }
  | { type: "SET_VIEWPORT_LABEL"; label: string | null }
  | { type: "SET_SPATIAL_SELECTION"; selection: MapContextSpatialSelection | null }
  | { type: "SET_REFERENCED_FEATURES"; features: MapFeature[] }
  | { type: "ADD_REFERENCED_FEATURES"; features: MapFeature[] }
  | { type: "MAP_ACTION_RECEIVED"; payload: MapActionPayload }
  | { type: "CONSUME_PENDING_ACTION" }
  | { type: "RESET" };

// ---------- Reducer ----------

export function mapChatReducer(
  state: MapChatState,
  action: MapChatAction,
): MapChatState {
  switch (action.type) {
    case "SELECT_PARCELS":
      return { ...state, selectedParcelIds: action.parcelIds };

    case "SET_SELECTED_PARCEL_FEATURES":
      return { ...state, selectedParcelFeatures: action.features };

    case "DESELECT_ALL":
      return { ...state, selectedParcelIds: [], selectedParcelFeatures: [] };

    case "TOGGLE_PARCEL": {
      const exists = state.selectedParcelIds.includes(action.parcelId);
      return {
        ...state,
        selectedParcelIds: exists
          ? state.selectedParcelIds.filter((id) => id !== action.parcelId)
          : [...state.selectedParcelIds, action.parcelId],
      };
    }

    case "SET_VIEWPORT":
      return {
        ...state,
        center: action.center,
        zoom: action.zoom,
        viewportBounds: action.bounds ?? state.viewportBounds,
        viewportLabel: action.label ?? state.viewportLabel,
      };

    case "SET_VIEWPORT_LABEL":
      return {
        ...state,
        viewportLabel: action.label,
      };

    case "SET_SPATIAL_SELECTION":
      return {
        ...state,
        spatialSelection: action.selection,
      };

    case "SET_REFERENCED_FEATURES":
      return { ...state, referencedFeatures: action.features };

    case "ADD_REFERENCED_FEATURES": {
      const existingIds = new Set(state.referencedFeatures.map((f) => f.parcelId));
      const newFeatures = action.features.filter((feature) => {
        if (existingIds.has(feature.parcelId)) {
          return false;
        }
        existingIds.add(feature.parcelId);
        return true;
      });
      return {
        ...state,
        referencedFeatures: [...state.referencedFeatures, ...newFeatures],
      };
    }

    case "MAP_ACTION_RECEIVED":
      return {
        ...state,
        pendingActions: [...state.pendingActions, action.payload],
      };

    case "CONSUME_PENDING_ACTION":
      return {
        ...state,
        pendingActions: state.pendingActions.slice(1),
      };

    case "RESET":
      return initialMapChatState;

    default:
      return state;
  }
}

// ---------- Context ----------

const MapChatStateContext = createContext<MapChatState>(initialMapChatState);
const MapChatDispatchContext = createContext<Dispatch<MapChatAction>>(() => {});

export function MapChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(mapChatReducer, initialMapChatState);
  return (
    <MapChatStateContext.Provider value={state}>
      <MapChatDispatchContext.Provider value={dispatch}>
        {children}
      </MapChatDispatchContext.Provider>
    </MapChatStateContext.Provider>
  );
}

export function useMapChatState() {
  return useContext(MapChatStateContext);
}

export function useMapChatDispatch() {
  return useContext(MapChatDispatchContext);
}

export function buildMapContextInput(state: MapChatState): MapContextInput | undefined {
  const hasCenter = Array.isArray(state.center) && state.center.length === 2;
  const hasZoom = typeof state.zoom === "number";
  const hasViewportBounds = Boolean(state.viewportBounds);
  const hasSelectedParcels = state.selectedParcelIds.length > 0;
  const hasSelectedParcelFeatures = state.selectedParcelFeatures.length > 0;
  const hasViewportLabel = Boolean(state.viewportLabel);
  const hasReferencedFeatures = state.referencedFeatures.length > 0;
  const hasSpatialSelection = Boolean(state.spatialSelection);

  if (
    !hasCenter &&
    !hasZoom &&
    !hasViewportBounds &&
    !hasSelectedParcels &&
    !hasSelectedParcelFeatures &&
    !hasViewportLabel &&
    !hasReferencedFeatures &&
    !hasSpatialSelection
  ) {
    return undefined;
  }

  return {
    center: hasCenter
      ? { lat: state.center![1], lng: state.center![0] }
      : null,
    zoom: hasZoom ? state.zoom ?? undefined : undefined,
    viewportBounds: hasViewportBounds ? state.viewportBounds ?? undefined : undefined,
    selectedParcelIds: hasSelectedParcels ? state.selectedParcelIds : undefined,
    selectedParcels: hasSelectedParcelFeatures
      ? state.selectedParcelFeatures.map(mapFeatureToContextFeature)
      : undefined,
    viewportLabel: state.viewportLabel ?? undefined,
    referencedFeatures: hasReferencedFeatures
      ? state.referencedFeatures.map(mapFeatureToContextFeature)
      : undefined,
    spatialSelection: hasSpatialSelection
      ? {
          ...state.spatialSelection!,
          bbox:
            state.spatialSelection?.bbox ?? derivePolygonBounds(state.spatialSelection?.coordinates),
        }
      : undefined,
  };
}

function mapFeatureToContextFeature(feature: MapFeature) {
  return {
    parcelId: feature.parcelId,
    address: feature.address,
    zoning: feature.zoningType,
    owner: feature.owner,
    acres: feature.acres,
    label: feature.label,
    center: feature.center,
    geometry: serializeGeometry(feature.geometry),
  };
}

function serializeGeometry(geometry: GeoJSON.Geometry | undefined): MapContextGeometry | undefined {
  if (!geometry) {
    return undefined;
  }

  if ("coordinates" in geometry) {
    return {
      type: geometry.type,
      coordinates: geometry.coordinates,
    };
  }

  if ("geometries" in geometry) {
    return {
      type: geometry.type,
      geometries: geometry.geometries,
    };
  }

  return undefined;
}

function derivePolygonBounds(
  coordinates: number[][][] | undefined,
): MapContextBounds | undefined {
  if (!coordinates?.length) {
    return undefined;
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const ring of coordinates) {
    for (const point of ring) {
      const [lng, lat] = point;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        continue;
      }
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return undefined;
  }

  return { west, south, east, north };
}
