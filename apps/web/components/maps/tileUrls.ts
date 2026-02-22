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
 * Returns the local fallback tile URL for explicit use.
 */
export function getLocalFallbackTileUrl(): string {
  return LOCAL_TILE_URL;
}

/**
 * Returns parcel vector tile URL (MVT from get_parcel_mvt).
 * Renders parcel boundaries for the full visible extent.
 *
 * When NEXT_PUBLIC_TILE_SERVER_URL is set (e.g. local HP Martin), fetches
 * directly from that server. Otherwise proxies via /api/map/tiles.
 */
export function getParcelTileUrl(): string {
  const base = process.env.NEXT_PUBLIC_TILE_SERVER_URL?.trim();
  if (base) {
    return `${base.replace(/\/$/, "")}/rpc/get_parcel_mvt/{z}/{x}/{y}.pbf`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/map/tiles/{z}/{x}/{y}`;
  }
  return "/api/map/tiles/{z}/{x}/{y}";
}

/**
 * Source-layer name for parcel vector tiles.
 * get_parcel_mvt RPC returns layer "parcels"; production Martin table uses "ebr_parcels".
 */
export function getParcelTileSourceLayer(): string {
  return process.env.NEXT_PUBLIC_TILE_SERVER_URL ? "parcels" : "ebr_parcels";
}
