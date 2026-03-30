export const TERRAIN_DEM_URL =
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_SOURCE_ID = "terrain-dem";
export const TERRAIN_ENCODING = "terrarium" as const;
export const DEFAULT_EXAGGERATION = 1.5;
export const MIN_EXAGGERATION = 0.5;
export const MAX_EXAGGERATION = 3.0;
