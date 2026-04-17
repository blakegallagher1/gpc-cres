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
//
// Martin MVT:
//   NEXT_PUBLIC_MARTIN_TILE_URL   — override full base URL (optional)
//   defaults to https://tiles.gallagherpropco.com
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

// Use services.arcgisonline.com (supports CORS) instead of server.arcgisonline.com (no CORS)
const ESRI_SATELLITE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const LOCAL_TILE_URL = "/api/map/tiles/{z}/{x}/{y}";

// ---------------------------------------------------------------------------
// Martin MVT — tiles.gallagherpropco.com
// ---------------------------------------------------------------------------
// Martin metadata endpoints share the same base URL.

/** Base URL for the Martin tile server (no trailing slash). */
const MARTIN_BASE_URL =
  process.env.NEXT_PUBLIC_MARTIN_TILE_URL?.replace(/\/$/, "") ??
  "https://tiles.gallagherpropco.com";

/**
 * Returns the Martin metadata URL for a specific table/view/function source.
 */
export function getMartinMetadataUrl(sourceId: string): string {
  return `${MARTIN_BASE_URL}/${sourceId}`;
}

/**
 * Returns the Martin MVT tile URL for an arbitrary source.
 */
export function getMartinVectorTileUrl(sourceId: string): string {
  return `${MARTIN_BASE_URL}/${sourceId}/{z}/{x}/{y}`;
}

/**
 * Returns the Martin MVT tile URL for a specific parcel-capable source.
 *
 * Martin URL format:
 *   https://tiles.gallagherpropco.com/{source_id}/{z}/{x}/{y}
 *
 * @param sourceId  The Martin source/function name (e.g. "ebr_parcels")
 */
export function getMartinParcelTileUrl(sourceId = "ebr_parcels"): string {
  return getMartinVectorTileUrl(sourceId);
}

/**
 * Returns the Martin tile URL for the full parcel layer with optional
 * query-string filters forwarded to Martin.
 *
 * @param sourceId   Martin source name (default: "ebr_parcels")
 * @param params     Optional key/value pairs appended as query string
 */
export function getMartinParcelTileUrlWithParams(
  sourceId = "ebr_parcels",
  params?: Record<string, string>
): string {
  const base = getMartinVectorTileUrl(sourceId);
  if (!params || Object.keys(params).length === 0) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

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
 * Returns the local fallback tile URL for explicit use.
 */
export function getLocalFallbackTileUrl(): string {
  return LOCAL_TILE_URL;
}

/**
 * Returns the same-origin zoning vector tile URL.
 * Proxied through /api/map/zoning-tiles to avoid CORS issues with Martin.
 */
export function getZoningTileUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/map/zoning-tiles/{z}/{x}/{y}`;
  }
  return "/api/map/zoning-tiles/{z}/{x}/{y}";
}

/**
 * Returns parcel vector tile URL (MVT from get_parcel_mvt).
 * Prefer getMartinParcelTileUrl() for new code.
 */
export function getParcelTileUrl(): string {
  return getMartinParcelTileUrl("ebr_parcels.1");
}

/**
 * Returns same-origin zoning vector tile URL proxied through the app.
 */
export function getZoningProxyTileUrl(): string {
  return "/api/map/zoning-tiles/{z}/{x}/{y}";
}

/**
 * Returns same-origin Future Land Use (FLU) vector tile URL proxied through
 * the app. The actual tile source is configured via FLU_TILE_ORIGIN +
 * FLU_TILE_PATH env vars; the proxy returns 404 for tiles until a parish
 * FLU source is wired. This lets us ship the layer toggle + rendering
 * pipeline without blocking on GIS data ingestion.
 */
export function getFluProxyTileUrl(): string {
  return "/api/map/flu-tiles/{z}/{x}/{y}";
}
