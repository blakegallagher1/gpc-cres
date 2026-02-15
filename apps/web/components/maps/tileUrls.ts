// ---------------------------------------------------------------------------
// Tile URL Resolver — MAP-001a
// ---------------------------------------------------------------------------
// Reads NEXT_PUBLIC_MAP_TILE_MODE to decide between remote tiles, a local
// placeholder endpoint, or auto-detection.
//
// Modes:
//   "remote" (default) — OSM / ESRI tile servers
//   "local"            — /api/map/tiles/{z}/{x}/{y} placeholder
//   "auto"             — remote with connectivity check fallback (future)
// ---------------------------------------------------------------------------

type TileMode = "remote" | "local" | "auto";

function getTileMode(): TileMode {
  const mode = process.env.NEXT_PUBLIC_MAP_TILE_MODE;
  if (mode === "local" || mode === "auto") return mode;
  return "remote";
}

const OSM_TILE_URLS = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const LOCAL_TILE_URL = "/api/map/tiles/{z}/{x}/{y}";

/**
 * Returns an array of street tile URLs (for MapLibre `tiles` array or Leaflet
 * subdomains). MapLibre does NOT support `{s}` subdomain templating, so we
 * always return explicit a/b/c URLs.
 */
export function getStreetTileUrls(): string[] {
  const mode = getTileMode();
  if (mode === "local") return [LOCAL_TILE_URL];
  // "remote" and "auto" both start with remote tiles
  return OSM_TILE_URLS;
}

/**
 * Returns a single satellite tile URL string.
 */
export function getSatelliteTileUrl(): string {
  const mode = getTileMode();
  if (mode === "local") return LOCAL_TILE_URL;
  return ESRI_SATELLITE_URL;
}

/**
 * Returns a single street tile URL for Leaflet (which handles `{s}` natively).
 * In local mode, returns the local placeholder URL instead.
 */
export function getLeafletStreetTileUrl(): string {
  const mode = getTileMode();
  if (mode === "local") return LOCAL_TILE_URL;
  return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

/**
 * Returns the local fallback tile URL for explicit use.
 */
export function getLocalFallbackTileUrl(): string {
  return LOCAL_TILE_URL;
}
