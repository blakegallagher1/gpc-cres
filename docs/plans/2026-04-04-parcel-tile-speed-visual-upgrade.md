# Parcel Tile Speed + Visual Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the Vercel tile proxy (80%+ latency reduction) and add data-driven parcel coloring by zoning/flood/acreage with zoom-dependent styling.

**Architecture:** Switch tile source from Vercel proxy (`/api/map/tiles/`) to direct Martin URL (`tiles.gallagherpropco.com/ebr_parcels.1/`). Add CORS via Cloudflare. Build shared MapLibre data expressions for zoning/flood/acreage color modes. Add a segmented control to switch modes. Use `feature-state` for hover highlights.

**Tech Stack:** MapLibre GL JS, Cloudflare Transform Rules, Martin vector tiles, React, Tailwind

---

### Task 1: Direct Tile Loading — tileUrls.ts

**Files:**
- Modify: `apps/web/components/maps/tileUrls.ts:122-127`

**Step 1: Update `getParcelTileUrl()` to return direct Martin URL**

Replace the current implementation that returns same-origin proxy:

```typescript
export function getParcelTileUrl(): string {
  return getMartinParcelTileUrl("ebr_parcels.1");
}
```

This changes the tile URL from `https://gallagherpropco.com/api/map/tiles/{z}/{x}/{y}` to `https://tiles.gallagherpropco.com/ebr_parcels.1/{z}/{x}/{y}`, eliminating the Vercel serverless function from the tile request chain.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/components/maps/tileUrls.ts
git commit -m "perf(map): switch parcel tiles to direct Martin URL"
```

---

### Task 2: Cloudflare CORS for Tile Server

**Files:** Cloudflare Dashboard (no code files)

**Step 1: Add Cloudflare Transform Rule for CORS**

In Cloudflare Dashboard → `gallagherpropco.com` zone → Rules → Transform Rules → Modify Response Header:

- Rule name: `Tile CORS`
- Match: `(http.host eq "tiles.gallagherpropco.com")`
- Add headers:
  - `Access-Control-Allow-Origin` = `https://gallagherpropco.com`
  - `Access-Control-Allow-Methods` = `GET, OPTIONS`
  - `Cache-Control` = `public, max-age=86400, stale-while-revalidate=604800, immutable`

**Step 2: Verify CORS works**

```bash
curl -s -I -H "Origin: https://gallagherpropco.com" \
  "https://tiles.gallagherpropco.com/ebr_parcels.1/14/4050/6736" 2>&1 \
  | grep -i "access-control\|cache-control"
```

Expected: `Access-Control-Allow-Origin: https://gallagherpropco.com` and `Cache-Control: public, max-age=86400...`

**Step 3: Test direct tile load in browser**

Open `https://gallagherpropco.com/map`, open DevTools Network tab. Tile requests should go to `tiles.gallagherpropco.com` (not `/api/map/tiles/`). No CORS errors in console.

---

### Task 3: Parcel Color Expressions Module

**Files:**
- Create: `apps/web/components/maps/parcelColorExpressions.ts`

**Step 1: Create the shared color expression module**

```typescript
import type { ExpressionSpecification } from "maplibre-gl";

export type ParcelColorMode = "zoning" | "flood" | "acreage";

// --- Zoning colors ---
const ZONING_FILL_COLOR: ExpressionSpecification = [
  "match",
  ["coalesce", ["get", "zoning_type"], ""],
  // Industrial
  "M1", "#6366f1",
  "M2", "#6366f1",
  "M3", "#6366f1",
  // Commercial
  "C1", "#f59e0b",
  "C2", "#f59e0b",
  "C3", "#f59e0b",
  "C4", "#f59e0b",
  "C5", "#f59e0b",
  // Residential
  "A1", "#10b981",
  "A2", "#10b981",
  "A3", "#10b981",
  "A4", "#10b981",
  "A5", "#10b981",
  "RE", "#10b981",
  // Buffer
  "B1", "#9ca3af",
  // Planned Unit
  "PUD", "#8b5cf6",
  // Default / unknown
  "#d4d4d4",
];

// --- Flood risk colors ---
const FLOOD_FILL_COLOR: ExpressionSpecification = [
  "match",
  ["coalesce", ["get", "flood_zone"], ""],
  "X", "#10b981",       // Minimal risk — green
  "X500", "#f59e0b",    // Moderate — amber
  "AE", "#ef4444",      // High risk — coral
  "A", "#ef4444",
  "AO", "#ef4444",
  "AH", "#ef4444",
  "VE", "#dc2626",      // Coastal flood — red
  "V", "#dc2626",
  "#d4d4d4",            // Unknown
];

// --- Acreage (area_sqft) graduated scale ---
const ACREAGE_FILL_COLOR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "area_sqft"], 0],
  0,       "#dbeafe",   // < 0.25 ac — lightest blue
  10890,   "#93c5fd",   // ~0.25 ac
  43560,   "#3b82f6",   // ~1 ac
  217800,  "#1d4ed8",   // ~5 ac
  435600,  "#1e3a8a",   // ~10 ac+
];

// --- Zoom-dependent fill opacity ---
const ZOOM_FILL_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10, 0.10,
  13, 0.18,
  16, 0.25,
];

// --- Zoom-dependent line width ---
const ZOOM_LINE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10, 0.5,
  13, 1,
  16, 1.5,
];

const ZOOM_LINE_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10, 0.3,
  13, 0.6,
  16, 0.8,
];

export function getParcelFillColor(mode: ParcelColorMode): ExpressionSpecification {
  switch (mode) {
    case "zoning":  return ZONING_FILL_COLOR;
    case "flood":   return FLOOD_FILL_COLOR;
    case "acreage": return ACREAGE_FILL_COLOR;
  }
}

export function getParcelFillOpacity(): ExpressionSpecification {
  return ZOOM_FILL_OPACITY;
}

export function getParcelLineWidth(): ExpressionSpecification {
  return ZOOM_LINE_WIDTH;
}

export function getParcelLineOpacity(): ExpressionSpecification {
  return ZOOM_LINE_OPACITY;
}

/** Outline color — white/light for contrast on all base layers */
export function getParcelLineColor(mode: ParcelColorMode): ExpressionSpecification {
  // Use a muted version of the fill color for outlines
  return getParcelFillColor(mode);
}

/** Legend entries for the active color mode */
export function getParcelLegendItems(mode: ParcelColorMode): Array<{ label: string; color: string }> {
  switch (mode) {
    case "zoning":
      return [
        { label: "Industrial", color: "#6366f1" },
        { label: "Commercial", color: "#f59e0b" },
        { label: "Residential", color: "#10b981" },
        { label: "Buffer", color: "#9ca3af" },
        { label: "PUD", color: "#8b5cf6" },
      ];
    case "flood":
      return [
        { label: "Minimal (X)", color: "#10b981" },
        { label: "Moderate", color: "#f59e0b" },
        { label: "High (AE/A)", color: "#ef4444" },
      ];
    case "acreage":
      return [
        { label: "< 0.25 ac", color: "#dbeafe" },
        { label: "~1 ac", color: "#3b82f6" },
        { label: "5+ ac", color: "#1e3a8a" },
      ];
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/components/maps/parcelColorExpressions.ts
git commit -m "feat(map): add parcel color expression module for zoning/flood/acreage"
```

---

### Task 4: Update ParcelBoundaryLayer with Data-Driven Coloring

**Files:**
- Modify: `apps/web/components/maps/layers/ParcelBoundaryLayer.tsx`

**Step 1: Rewrite ParcelBoundaryLayer with color mode support**

```tsx
"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";
import {
  type ParcelColorMode,
  getParcelFillColor,
  getParcelFillOpacity,
  getParcelLineColor,
  getParcelLineWidth,
  getParcelLineOpacity,
} from "../parcelColorExpressions";

interface ParcelBoundaryLayerProps {
  visible: boolean;
  dimmed?: boolean;
  colorMode?: ParcelColorMode;
}

export function ParcelBoundaryLayer({
  visible,
  dimmed = false,
  colorMode = "zoning",
}: ParcelBoundaryLayerProps) {
  return (
    <Source
      id="parcel-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("ebr_parcels.1")]}
      minzoom={10}
      maxzoom={22}
    >
      <Layer
        id="parcel-tiles-fill"
        type="fill"
        source-layer="ebr_parcels.1"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": dimmed ? "#d4d4d4" : getParcelFillColor(colorMode),
          "fill-opacity": dimmed ? 0.02 : getParcelFillOpacity(),
        }}
      />
      <Layer
        id="parcel-tiles-line"
        type="line"
        source-layer="ebr_parcels.1"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "line-color": dimmed ? "#a3a3a3" : getParcelLineColor(colorMode),
          "line-width": dimmed ? 0.5 : getParcelLineWidth(),
          "line-opacity": dimmed ? 0.2 : getParcelLineOpacity(),
        }}
      />
    </Source>
  );
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/components/maps/layers/ParcelBoundaryLayer.tsx
git commit -m "feat(map): data-driven parcel coloring in ParcelBoundaryLayer"
```

---

### Task 5: Update MapLibreParcelMap Initial Style

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx`

This task updates the inline MapLibre style object (the `parcel-tiles-fill` and `parcel-tiles-line` layers at ~lines 1702-1729) with data-driven expressions, and updates the `forceReloadParcelSource` function to use the direct tile URL.

**Step 1: Add import for color expressions**

Add at top of file with other imports:

```typescript
import {
  type ParcelColorMode,
  getParcelFillColor,
  getParcelFillOpacity,
  getParcelLineColor,
  getParcelLineWidth,
  getParcelLineOpacity,
} from "./parcelColorExpressions";
```

**Step 2: Add `parcelColorMode` state**

Near the existing `showParcelBoundaries` state (~line 641):

```typescript
const [parcelColorMode, setParcelColorMode] = useState<ParcelColorMode>("zoning");
```

**Step 3: Update the inline `parcel-tiles-fill` paint (~line 1710)**

Replace the static paint object:

```typescript
paint: {
  "fill-color": getParcelFillColor(parcelColorMode),
  "fill-opacity": getParcelFillOpacity(),
},
```

**Step 4: Update the inline `parcel-tiles-line` paint (~line 1724)**

Replace the static paint object:

```typescript
paint: {
  "line-color": getParcelLineColor(parcelColorMode),
  "line-width": getParcelLineWidth(),
  "line-opacity": getParcelLineOpacity(),
},
```

**Step 5: Update `forceReloadParcelSource` (~line 2058)**

Change `getParcelTileUrl()` call (now returns direct Martin URL — same function, just confirming it picks up the Task 1 change automatically).

**Step 6: Add a useEffect to repaint on color mode change**

After the existing `hideBoundaryLayerVisibility` effect, add a new effect that updates paint properties when `parcelColorMode` changes:

```typescript
useEffect(() => {
  if (!mapReady || !mapRef.current) return;
  const map = mapRef.current;
  try {
    if (map.getLayer("parcel-tiles-fill")) {
      map.setPaintProperty("parcel-tiles-fill", "fill-color", getParcelFillColor(parcelColorMode));
    }
    if (map.getLayer("parcel-tiles-line")) {
      map.setPaintProperty("parcel-tiles-line", "line-color", getParcelLineColor(parcelColorMode));
    }
  } catch { /* layer may not exist yet */ }
}, [parcelColorMode, mapReady]);
```

**Step 7: Expose `parcelColorMode` and `setParcelColorMode` to the HUD/controls**

Find where props like `setShowParcelBoundaries` are passed to child components (MapWorkbenchPanel, MapOperatorConsole, etc.) and add `parcelColorMode` / `setParcelColorMode` alongside them. The exact prop drilling depends on the component tree — grep for `setShowParcelBoundaries` to find the insertion points.

**Step 8: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 9: Commit**

```bash
git add apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): data-driven tile paint + color mode state in MapLibreParcelMap"
```

---

### Task 6: Parcel Color Mode Control UI

**Files:**
- Create: `apps/web/components/maps/ParcelColorModeControl.tsx`

**Step 1: Build the segmented control**

```tsx
"use client";

import { type ParcelColorMode } from "./parcelColorExpressions";

const MODES: Array<{ value: ParcelColorMode; label: string }> = [
  { value: "zoning", label: "Zoning" },
  { value: "flood", label: "Flood" },
  { value: "acreage", label: "Size" },
];

interface ParcelColorModeControlProps {
  value: ParcelColorMode;
  onChange: (mode: ParcelColorMode) => void;
}

export function ParcelColorModeControl({ value, onChange }: ParcelColorModeControlProps) {
  return (
    <div className="flex items-center rounded-md border border-border/60 bg-background/80 text-xs backdrop-blur-sm">
      {MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          className={`px-2.5 py-1 transition-colors first:rounded-l-md last:rounded-r-md ${
            value === mode.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Wire into the map HUD**

Find where the map HUD controls are rendered (near the layer toggle / legend area in `MapLibreParcelMap.tsx`). Render the control when `showParcelBoundaries` is true:

```tsx
{showParcelBoundaries && (
  <ParcelColorModeControl value={parcelColorMode} onChange={setParcelColorMode} />
)}
```

Position it near the existing legend (`MapLegend` component) — bottom-right area of the map.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/components/maps/ParcelColorModeControl.tsx apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): add parcel color mode segmented control"
```

---

### Task 7: Hover Highlight via Feature State

**Files:**
- Modify: `apps/web/components/maps/mapLibreAdapter.ts`
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx`

**Step 1: Add feature-state hover tracking in mapLibreAdapter.ts**

In the `bindMapInteractionHandlers` function, add hover state tracking. Before the existing `handleMouseEnter`:

```typescript
let hoveredTileFeatureId: string | number | null = null;

const handleTileHover = (event: maplibregl.MapLayerMouseEvent) => {
  const feature = event.features?.[0];
  if (hoveredTileFeatureId !== null) {
    map.setFeatureState(
      { source: "parcel-tiles", sourceLayer: "ebr_parcels.1", id: hoveredTileFeatureId },
      { hover: false },
    );
  }
  if (feature?.id != null) {
    hoveredTileFeatureId = feature.id;
    map.setFeatureState(
      { source: "parcel-tiles", sourceLayer: "ebr_parcels.1", id: feature.id },
      { hover: true },
    );
  } else {
    hoveredTileFeatureId = null;
  }
};

const clearTileHover = () => {
  if (hoveredTileFeatureId !== null) {
    map.setFeatureState(
      { source: "parcel-tiles", sourceLayer: "ebr_parcels.1", id: hoveredTileFeatureId },
      { hover: false },
    );
    hoveredTileFeatureId = null;
  }
};
```

Bind these to existing events:
```typescript
map.on("mousemove", "parcel-tiles-fill", handleTileHover);
map.on("mouseleave", "parcel-tiles-fill", clearTileHover);
```

And unbind in the cleanup return function:
```typescript
map.off("mousemove", "parcel-tiles-fill", handleTileHover);
map.off("mouseleave", "parcel-tiles-fill", clearTileHover);
```

**Step 2: Update fill paint in MapLibreParcelMap.tsx to react to hover state**

Change `fill-opacity` to use a `case` expression that checks feature state:

```typescript
"fill-opacity": [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  0.40,
  getParcelFillOpacity(),
],
```

Add a hover outline. After the existing `parcel-tiles-line` layer definition (~line 1729), add a new layer:

```typescript
{
  id: "parcel-tiles-hover-outline",
  type: "line",
  source: "parcel-tiles",
  "source-layer": "ebr_parcels.1",
  layout: { visibility: showLayers && showParcelBoundaries ? "visible" : "none" },
  filter: ["boolean", ["feature-state", "hover"], false],
  paint: {
    "line-color": "#ffffff",
    "line-width": 2.5,
    "line-opacity": 0.9,
  },
},
```

Note: MapLibre feature-state filters don't work in `filter` — the hover outline visibility should instead be controlled via paint expression:

```typescript
{
  id: "parcel-tiles-hover-outline",
  type: "line",
  source: "parcel-tiles",
  "source-layer": "ebr_parcels.1",
  layout: { visibility: showLayers && showParcelBoundaries ? "visible" : "none" },
  paint: {
    "line-color": "#ffffff",
    "line-width": [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      2.5,
      0,
    ],
    "line-opacity": 0.9,
  },
},
```

**Step 3: Also update `hideBoundaryLayerVisibility` to include the hover outline layer (~line 2086)**

```typescript
setLayerVisibilitySafe(map, "parcel-tiles-hover-outline", showLayers && showParcelBoundaries);
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/components/maps/mapLibreAdapter.ts apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): hover highlight for tile parcels via feature-state"
```

---

### Task 8: Update MapLegend for Color Mode

**Files:**
- Modify: `apps/web/components/maps/MapLegend.tsx`

**Step 1: Accept color mode prop and show mode-specific legend items**

Add `parcelColorMode` to `MapLegendProps` and use `getParcelLegendItems()` when parcels are active:

```typescript
import { type ParcelColorMode, getParcelLegendItems } from "./parcelColorExpressions";

export interface MapLegendProps {
  showParcelBoundaries: boolean;
  showZoning: boolean;
  showFlood: boolean;
  showSoils: boolean;
  showWetlands: boolean;
  showEpa: boolean;
  showMobileHomePark: boolean;
  parcelColorMode?: ParcelColorMode;
}
```

Replace the static parcels legend entry:

```typescript
...(showParcelBoundaries
  ? getParcelLegendItems(parcelColorMode ?? "zoning").map((item) => ({
      label: item.label,
      color: item.color,
    }))
  : []),
```

**Step 2: Update MapLegend callers to pass `parcelColorMode`**

Grep for `<MapLegend` and add `parcelColorMode={parcelColorMode}` prop.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/components/maps/MapLegend.tsx apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): dynamic legend entries for parcel color mode"
```

---

### Task 9: Final Integration Test + Deploy

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (except pre-existing admin/export timezone test)

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit any remaining changes and push**

```bash
git push origin main
```

**Step 4: Verify in production**

After Vercel deploys (~3 min):
1. Open `https://gallagherpropco.com/map`
2. DevTools Network: tile requests go to `tiles.gallagherpropco.com` (not `/api/map/tiles/`)
3. Parcels show zoning-colored fills at zoom 11+
4. Switch color mode control between Zoning / Flood / Size
5. Hover a parcel — fill brightens + white outline appears
6. Zoom in/out — line width and opacity scale smoothly

---

**Dependency chain:**
- Task 1 (tileUrls) — independent
- Task 2 (CORS) — independent, can run in parallel with Task 1
- Task 3 (expressions module) — independent
- Task 4 (ParcelBoundaryLayer) — depends on Task 3
- Task 5 (MapLibreParcelMap) — depends on Tasks 1, 3
- Task 6 (color mode control) — depends on Tasks 3, 5
- Task 7 (hover) — depends on Task 5
- Task 8 (legend) — depends on Tasks 3, 5
- Task 9 (integration) — depends on all
