/**
 * Normalized parcel shape rendered across the map surface.
 */
export interface MapParcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  dealId?: string;
  dealName?: string;
  dealStatus?: string;
  floodZone?: string | null;
  currentZoning?: string | null;
  propertyDbId?: string | null;
  geometryLookupKey?: string | null;
  acreage?: number | null;
}

/**
 * GeoJSON payload used for map trajectory overlays.
 */
export interface MapTrajectoryData {
  type: "FeatureCollection";
  features: unknown[];
}

/**
 * Per-parcel velocity payload used by trajectory overlays.
 */
export interface MapTrajectoryVelocityDatum {
  parcel_id: string;
  velocity_of_change: number;
}

/**
 * Supported heatmap presets for the parcel map.
 */
export type HeatmapPresetKey = "sale_activity" | "price_density" | "development_activity";

/**
 * Named reference-layer bundles for the left map workbench.
 */
export type MapWorkbenchPreset =
  | "parcel-focus"
  | "zoning-scan"
  | "flood-risk"
  | "environmental"
  | "full-stack"
  | "reset";

/**
 * Boolean visibility state for the reference overlays controlled in the workbench.
 */
export interface MapReferenceOverlayState {
  parcelBoundaries: boolean;
  zoning: boolean;
  flood: boolean;
  soils: boolean;
  wetlands: boolean;
  epa: boolean;
}

/**
 * Comparable sale point used to build heatmap sources.
 */
export interface SaleComp {
  lat: number;
  lng: number;
  saleDate: string | null;
  pricePerAcre: number | null;
}

/**
 * Lightweight map HUD state pushed to parent surfaces.
 */
export interface MapHudState {
  activeOverlays: string[];
  drawMode: "idle" | "drawing" | "polygon";
}
