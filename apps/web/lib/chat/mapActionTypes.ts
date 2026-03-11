// --- Map Action Payloads ---

export interface MapActionHighlight {
  action: "highlight";
  parcelIds: string[];
  style?: "pulse" | "outline" | "fill";
  color?: string; // hex, default "#f97316" (orange-500)
  durationMs?: number; // auto-clear after N ms, 0 = permanent until next action
}

export interface MapActionFlyTo {
  action: "flyTo";
  center: [number, number]; // [lng, lat]
  zoom?: number; // default 15
  parcelId?: string; // optional: highlight this parcel after fly
}

export interface MapActionAddLayer {
  action: "addLayer";
  layerId: string; // unique key for removal
  geojson: GeoJSON.FeatureCollection;
  style?: {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
  };
  label?: string; // legend label
}

export interface MapActionClearLayers {
  action: "clearLayers";
  layerIds?: string[]; // specific layers, or omit to clear all temporary layers
}

export type MapActionPayload =
  | MapActionHighlight
  | MapActionFlyTo
  | MapActionAddLayer
  | MapActionClearLayers;

export interface MapActionEvent {
  type: "map_action";
  payload: MapActionPayload;
  toolCallId?: string | null; // correlate with the tool that triggered it
}

// --- Map Feature (structured parcel data from tool results) ---

export interface MapFeature {
  parcelId: string;
  address?: string;
  zoningType?: string;
  owner?: string;
  acres?: number;
  label?: string; // short display label
  center?: { lat: number; lng: number };
  geometry?: GeoJSON.Geometry; // full parcel geometry if available
}
