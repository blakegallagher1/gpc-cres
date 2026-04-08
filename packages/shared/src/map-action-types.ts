type Position = number[];
type PointGeometry = { type: "Point"; coordinates: Position };
type MultiPointGeometry = { type: "MultiPoint"; coordinates: Position[] };
type LineStringGeometry = { type: "LineString"; coordinates: Position[] };
type MultiLineStringGeometry = { type: "MultiLineString"; coordinates: Position[][] };
type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
type MapGeometryCollection = { type: "GeometryCollection"; geometries: MapGeometry[] };

type MapGeometry =
  | PointGeometry
  | MultiPointGeometry
  | LineStringGeometry
  | MultiLineStringGeometry
  | PolygonGeometry
  | MultiPolygonGeometry
  | MapGeometryCollection;

type MapFeatureRecord = {
  type: "Feature";
  geometry: MapGeometry;
  properties: Record<string, unknown> | null;
};

type MapFeatureCollection = {
  type: "FeatureCollection";
  features: MapFeatureRecord[];
};

export interface MapActionHighlight {
  action: "highlight";
  parcelIds: string[];
  style?: "pulse" | "outline" | "fill";
  color?: string;
  durationMs?: number;
}

export interface MapActionFlyTo {
  action: "flyTo";
  center: [number, number];
  zoom?: number;
  parcelId?: string;
}

export interface MapActionAddLayer {
  action: "addLayer";
  layerId: string;
  geojson: MapFeatureCollection;
  style?: {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
  };
  label?: string;
}

export interface MapActionClearLayers {
  action: "clearLayers";
  layerIds?: string[];
}

export type MapActionPayload =
  | MapActionHighlight
  | MapActionFlyTo
  | MapActionAddLayer
  | MapActionClearLayers;

export interface MapActionEvent {
  type: "map_action";
  payload: MapActionPayload;
  toolCallId?: string | null;
}

export interface MapFeature {
  parcelId: string;
  address?: string;
  zoningType?: string;
  owner?: string;
  acres?: number;
  label?: string;
  center?: { lat: number; lng: number };
  geometry?: MapGeometry;
}
