/**
 * Color mappings and style functions for map overlay layers.
 */

// ---------------------------------------------------------------------------
// Deal status → parcel boundary color
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  INTAKE: "#6b7280",
  SCREENING: "#8b5cf6",
  TRIAGE_PENDING: "#f59e0b",
  TRIAGE_DONE: "#f97316",
  PREAPP: "#3b82f6",
  HEARING: "#06b6d4",
  ENTITLED: "#10b981",
  UNDER_CONTRACT: "#14b8a6",
  CLOSING: "#22c55e",
  EXITED: "#059669",
  KILLED: "#ef4444",
};

export const DEFAULT_STATUS_COLOR = "#6b7280";

// ---------------------------------------------------------------------------
// Zoning code → category color
// ---------------------------------------------------------------------------

export function getZoningColor(zoning: string | null | undefined): string {
  if (!zoning) return "#9ca3af";
  const code = zoning.toUpperCase();
  // Industrial / Manufacturing
  if (/^[MI]\d|INDUSTRIAL|MANUFACT|WAREHOUSE/i.test(code)) return "#7c3aed";
  // Commercial / Business
  if (/^[CB]\d|COMMERCIAL|BUSINESS|RETAIL|OFFICE/i.test(code)) return "#3b82f6";
  // Residential / Agricultural
  if (/^[RA]\d|RESIDENTIAL|AGRICULTURAL|RURAL/i.test(code)) return "#22c55e";
  // Mixed-use / Planned Development
  if (/MIXED|MU|PD|PLANNED/i.test(code)) return "#f97316";
  return "#9ca3af";
}

export const ZONING_CATEGORY_LABELS: Record<string, string> = {
  "#7c3aed": "Industrial",
  "#3b82f6": "Commercial",
  "#22c55e": "Residential",
  "#f97316": "Mixed / PD",
  "#9ca3af": "Unknown",
};

// ---------------------------------------------------------------------------
// FEMA flood zone → overlay color
// Picks the worst-case zone present in the text.
// ---------------------------------------------------------------------------

export function getFloodColor(floodZone: string | null | undefined): string {
  if (!floodZone) return "transparent";
  const text = floodZone.toUpperCase().trim();
  // Coastal flood — worst (V, VE, or "ZONE V*")
  if (/^V[E]?\b|ZONE\s*V/i.test(text)) return "rgba(220, 38, 38, 0.5)";
  // Zone AE / AH / AO (high risk with BFE) — check before bare "A"
  if (/^A[EHO]\b|ZONE\s*A[EHO]/i.test(text)) return "rgba(249, 115, 22, 0.4)";
  // Zone A (high risk, no BFE)
  if (/^A\b|ZONE\s*A\b(?!E|H|O)/i.test(text)) return "rgba(239, 68, 68, 0.4)";
  // Zone X shaded (moderate risk / 500-year)
  if (/SHADED|0\.2.?%|500.?YEAR/i.test(text)) return "rgba(251, 191, 36, 0.3)";
  // Zone X unshaded — minimal risk
  if (/^X\b|ZONE\s*X/i.test(text)) return "transparent";
  // OPEN WATER or other non-risk
  if (/OPEN.?WATER/i.test(text)) return "transparent";
  return "rgba(156, 163, 175, 0.2)";
}

// ---------------------------------------------------------------------------
// GeoJSON coordinate conversion
// GeoJSON uses [lng, lat]; Leaflet uses [lat, lng]
// ---------------------------------------------------------------------------

type LatLngTuple = [number, number];

/**
 * Convert a GeoJSON Polygon or MultiPolygon geometry to Leaflet positions.
 * Returns an array of polygons, where each polygon is an array of rings,
 * and each ring is an array of [lat, lng] tuples.
 */
export function geoJsonToPositions(
  geometry: { type: string; coordinates: unknown }
): LatLngTuple[][][] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return [
      coords.map((ring) =>
        ring.map(([lng, lat]) => [lat, lng] as LatLngTuple)
      ),
    ];
  }
  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    return coords.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([lng, lat]) => [lat, lng] as LatLngTuple)
      )
    );
  }
  return [];
}

/* ──────────────────────────────────────────────────
   DARK COMMAND CENTER — base map style + colors
   ────────────────────────────────────────────────── */

/** CartoDB dark_all raster tiles — used as the default basemap in dark mode. */
export const DARK_BASE_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
];

/** Status colors re-tuned for dark backgrounds (higher saturation, lighter). */
export const DARK_STATUS_COLORS: Record<string, string> = {
  "prospecting":    "#60a5fa",  // blue-400
  "under_contract": "#facc15",  // yellow-400
  "closing":        "#4ade80",  // green-400
  "exited":         "#059669",  // green-700
  "killed":         "#f87171",  // red-400
};

const DARK_DEFAULT_STATUS_COLOR = "#64748b"; // slate-500

/** MapLibre style object for dark mode. Drop-in replacement for the inline style object in MapLibreParcelMap. */
export function buildDarkStyle(sources: Record<string, unknown>, layers: unknown[]): {
  version: 8;
  sources: Record<string, unknown>;
  layers: unknown[];
} {
  return {
    version: 8,
    sources: {
      "dark-carto": {
        type: "raster",
        tiles: DARK_BASE_TILES,
        tileSize: 256,
        attribution: "© CartoDB © OpenStreetMap",
      },
      ...sources,
    },
    layers: [
      {
        id: "base-dark",
        type: "raster",
        source: "dark-carto",
        layout: { visibility: "visible" },
      },
      ...layers,
    ],
  };
}

/** For dark mode: parcel fill colors tuned for dark basemap visibility. */
export const DARK_PARCEL_FILL_OPACITY = 0.35;
export const DARK_PARCEL_LINE_OPACITY = 0.9;
export const DARK_PARCEL_LINE_COLOR_SELECTED = "#ffffff";
