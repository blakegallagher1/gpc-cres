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
// Zoning code → per-district color (EBR UDC)
// ---------------------------------------------------------------------------

/**
 * Per-district zoning color map. Uses the primary zone code (before comma).
 * Grouped by category with distinct hues within each group.
 */
export const ZONING_DISTRICT_COLORS: Record<string, string> = {
  // ── Residential (greens / teals) ───────────────────────────────────
  A1:     "#16a34a",  // single-family large lot — deep green
  "A2":   "#22c55e",  // single-family medium lot — green
  "A2.1": "#2dd4bf",  // single-family small lot — teal
  "A2.5": "#34d399",  // single-family cluster — mint
  "A2.6": "#4ade80",  // single-family compact — light green
  "A2.7": "#6ee7b7",  // single-family narrow — pale green
  "A2.9": "#a7f3d0",  // single-family tiny — very pale green
  "A3.1": "#0d9488",  // two-family — dark teal
  "A3.2": "#14b8a6",  // three-family — teal
  "A3.3": "#5eead4",  // multi-family low — light teal
  A4:     "#0e7490",  // multi-family high — dark cyan
  A5:     "#06b6d4",  // multi-family high-rise — cyan
  R:      "#15803d",  // rural residential — forest green
  RS:     "#65a30d",  // residential single — olive green
  RE:     "#84cc16",  // residential estate — lime
  "RE/A1":"#a3e635",  // residential estate/A1 — bright lime
  RU:     "#4d7c0f",  // rural — dark olive

  // ── Commercial (blues / indigos) ───────────────────────────────────
  C1:     "#2563eb",  // neighborhood commercial — blue
  C2:     "#1d4ed8",  // general commercial — dark blue
  C5:     "#3b82f6",  // heavy commercial — medium blue
  "C-AB-1":"#6366f1", // commercial alcohol bev 1 — indigo
  "C-AB-2":"#818cf8", // commercial alcohol bev 2 — light indigo
  CN:     "#60a5fa",  // commercial neighborhood — sky blue
  CG:     "#1e40af",  // commercial general — navy
  CW:     "#7dd3fc",  // commercial waterfront — light sky
  CW1:    "#38bdf8",  // commercial waterfront 1 — bright sky
  CW2:    "#0ea5e9",  // commercial waterfront 2 — ocean
  CW3:    "#0284c7",  // commercial waterfront 3 — deep ocean
  B:      "#4f46e5",  // buffer — violet
  B1:     "#7c3aed",  // buffer 1 — purple
  BP:     "#a78bfa",  // business park — lavender

  // ── Industrial (purples / magentas) ────────────────────────────────
  M1:     "#9333ea",  // light industrial — purple
  M2:     "#7e22ce",  // heavy industrial — dark purple
  I:      "#c026d3",  // industrial — magenta

  // ── Planned / Mixed-use (oranges / ambers) ─────────────────────────
  PUD:    "#ea580c",  // planned unit development — deep orange
  SPUD:   "#f97316",  // special PUD — orange
  ISPUD:  "#fb923c",  // interim special PUD — light orange
  TND:    "#d97706",  // traditional neighborhood — amber
  UC:     "#f59e0b",  // urban core — yellow-amber
  "NC":   "#fbbf24",  // neighborhood conservation — gold
  "NC-AB":"#fcd34d",  // neighborhood conservation AB — light gold

  // ── Government / Open space (browns / warm grays) ──────────────────
  GA:     "#92400e",  // government/airport — brown
  GOL:    "#a16207",  // government open land — dark amber
  GOH:    "#b45309",  // government open heavy — burnt orange
  GU:     "#78716c",  // government utility — warm gray
  HC1:    "#dc2626",  // highway commercial 1 — red
  HC2:    "#ef4444",  // highway commercial 2 — bright red
  HDD:    "#b91c1c",  // historic downtown — dark red

  // ── Lake / Legacy commercial ───────────────────────────────────────
  LC1:    "#0369a1",  // lake commercial 1 — steel blue
  LC2:    "#0891b2",  // lake commercial 2 — dark cyan
  LC3:    "#0e7490",  // lake commercial 3 — teal
  NO:     "#d4d4d8",  // not designated — light gray
};

const ZONING_FALLBACK_COLOR = "#9ca3af";

export function getZoningColor(zoning: string | null | undefined): string {
  if (!zoning) return ZONING_FALLBACK_COLOR;
  const primary = zoning.split(",")[0].trim().toUpperCase();
  if (ZONING_DISTRICT_COLORS[primary]) return ZONING_DISTRICT_COLORS[primary];
  // Fallback by category prefix
  const code = primary;
  if (/^[MI]/.test(code)) return "#9333ea";
  if (/^C/.test(code)) return "#2563eb";
  if (/^B/.test(code)) return "#4f46e5";
  if (/^[AR]/.test(code)) return "#22c55e";
  if (/PUD|SPUD|TND|UC/.test(code)) return "#f97316";
  if (/^G/.test(code)) return "#92400e";
  if (/^HC/.test(code)) return "#dc2626";
  if (/^LC/.test(code)) return "#0369a1";
  return ZONING_FALLBACK_COLOR;
}

export const ZONING_CATEGORY_LABELS: Record<string, string> = {
  "#16a34a": "Residential (A1)",
  "#22c55e": "Residential (A2)",
  "#0d9488": "Multi-family",
  "#0e7490": "Multi-family High",
  "#15803d": "Rural Residential",
  "#2563eb": "Commercial",
  "#1d4ed8": "General Commercial",
  "#6366f1": "Commercial ABC",
  "#4f46e5": "Buffer",
  "#9333ea": "Light Industrial",
  "#7e22ce": "Heavy Industrial",
  "#ea580c": "Planned (PUD)",
  "#f97316": "Mixed / Special PUD",
  "#d97706": "Traditional (TND)",
  "#dc2626": "Highway Commercial",
  "#92400e": "Government",
  "#0369a1": "Lake Commercial",
  "#9ca3af": "Other",
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
