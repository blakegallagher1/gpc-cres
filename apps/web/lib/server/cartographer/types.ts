import "server-only";

// ---------------------------------------------------------------------------
// Cartographer shared types
// ---------------------------------------------------------------------------

/** Bounding box in [west, south, east, north] order (EPSG:4326). */
export type BBox = [number, number, number, number];

/** Minimal map viewport state injected per turn. */
export interface MapViewportState {
  bbox: BBox;
  zoom: number;
  center: { lat: number; lng: number };
}

/** GeoJSON geometry subset used by Cartographer. */
export interface GeoJsonGeometry {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

export interface GeoJsonFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

// ---------------------------------------------------------------------------
// Cartographer actions — emitted to the /map surface
// ---------------------------------------------------------------------------

export type CartographerAction =
  | { action: "add_layer"; layerId: string; geojson: GeoJsonFeatureCollection; style?: LayerStyle; label?: string }
  | { action: "fly_to"; center: { lat: number; lng: number }; zoom?: number; bbox?: BBox }
  | { action: "select"; featureIds: string[] }
  | { action: "annotate"; features: GeoJsonFeature[]; label?: string }
  | { action: "draw"; geometry: GeoJsonGeometry; style?: LayerStyle }
  | { action: "message"; text: string; severity?: "info" | "warn" | "error" }
  | { action: "propose_action"; description: string; proposedActions: CartographerAction[] };

export interface LayerStyle {
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Thesis — user-defined investment thesis for fit-score heatmaps
// ---------------------------------------------------------------------------

export interface ThesisWeightEntry {
  /** e.g. "acreage_min", "zoning_allows", "flood_zone_safe", "road_frontage" */
  factor: string;
  /** 0–1 weight within the thesis */
  weight: number;
  /** Optional threshold for pass/fail factors */
  threshold?: number | string;
}

export interface ThesisDefinition {
  id?: string;
  orgId: string;
  name: string;
  description?: string;
  weights: ThesisWeightEntry[];
}

// ---------------------------------------------------------------------------
// Fit-score result
// ---------------------------------------------------------------------------

export interface FitScoreResult {
  parcelId: string;
  score: number; // 0–100
  breakdown: Record<string, { raw: number; weighted: number; detail: string }>;
  thesis: string; // thesis name reference
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export interface AssemblageCandidateResult {
  assemblageName: string;
  parcelIds: string[];
  totalAcreage: number;
  combinedGeometry: GeoJsonGeometry | null;
  fitScore: number | null;
  notes: string;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Hypothetical site plan
// ---------------------------------------------------------------------------

export interface SitePlanZone {
  label: string;
  use: string;
  geometry: GeoJsonGeometry;
  acreage: number;
}

export interface HypotheticalSitePlanResult {
  planName: string;
  parcelIds: string[];
  zones: SitePlanZone[];
  totalAcreage: number;
  notes: string;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Temporal change detection
// ---------------------------------------------------------------------------

export interface TemporalChangeRecord {
  parcelId: string;
  field: string;
  previousValue: unknown;
  currentValue: unknown;
  changedAt: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Curiosity trail — proactive suggestions
// ---------------------------------------------------------------------------

export interface CuriosityTrailItem {
  id: string;
  label: string;
  description: string;
  trigger: "viewport_change" | "selection" | "query_result" | "idle";
  suggestedActions: CartographerAction[];
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// SQL validation result
// ---------------------------------------------------------------------------

export interface SqlValidationResult {
  valid: boolean;
  sanitizedSql: string | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Common query params flowing through all Cartographer modules
// ---------------------------------------------------------------------------

export interface CartographerContext {
  orgId: string;
  userId?: string;
  viewport?: MapViewportState;
}
