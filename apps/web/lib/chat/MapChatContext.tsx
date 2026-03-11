"use client";

import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { MapContextInput } from "@entitlement-os/shared";
import type { MapActionPayload, MapFeature } from "./mapActionTypes";

// ---------- State ----------

export interface MapChatState {
  /** Currently selected parcel IDs (shared between map clicks and chat references) */
  selectedParcelIds: string[];
  /** Features the agent has referenced in the current conversation turn */
  referencedFeatures: MapFeature[];
  /** Current map viewport center */
  center: [number, number] | null; // [lng, lat]
  /** Current map zoom level */
  zoom: number | null;
  /** Queue of pending map actions from SSE events */
  pendingActions: MapActionPayload[];
  /** Viewport label (e.g., "Downtown Baton Rouge") */
  viewportLabel: string | null;
}

export const initialMapChatState: MapChatState = {
  selectedParcelIds: [],
  referencedFeatures: [],
  center: null,
  zoom: null,
  pendingActions: [],
  viewportLabel: null,
};

// ---------- Actions ----------

export type MapChatAction =
  | { type: "SELECT_PARCELS"; parcelIds: string[] }
  | { type: "DESELECT_ALL" }
  | { type: "TOGGLE_PARCEL"; parcelId: string }
  | { type: "SET_VIEWPORT"; center: [number, number]; zoom: number; label?: string }
  | { type: "SET_VIEWPORT_LABEL"; label: string | null }
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

    case "DESELECT_ALL":
      return { ...state, selectedParcelIds: [] };

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
        viewportLabel: action.label ?? state.viewportLabel,
      };

    case "SET_VIEWPORT_LABEL":
      return {
        ...state,
        viewportLabel: action.label,
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
  const hasSelectedParcels = state.selectedParcelIds.length > 0;
  const hasViewportLabel = Boolean(state.viewportLabel);
  const hasReferencedFeatures = state.referencedFeatures.length > 0;

  if (
    !hasCenter &&
    !hasZoom &&
    !hasSelectedParcels &&
    !hasViewportLabel &&
    !hasReferencedFeatures
  ) {
    return undefined;
  }

  return {
    center: hasCenter
      ? { lat: state.center![1], lng: state.center![0] }
      : null,
    zoom: hasZoom ? state.zoom ?? undefined : undefined,
    selectedParcelIds: hasSelectedParcels ? state.selectedParcelIds : undefined,
    viewportLabel: state.viewportLabel ?? undefined,
    referencedFeatures: hasReferencedFeatures
      ? state.referencedFeatures.map((feature) => ({
          parcelId: feature.parcelId,
          address: feature.address,
          zoning: feature.zoningType,
        }))
      : undefined,
  };
}
