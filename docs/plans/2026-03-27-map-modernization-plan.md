# Map Stack Modernization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken zoning overlay, then modernize the map stack with react-maplibre, deck.gl, Protomaps vector base maps, and 3D terrain.

**Architecture:** Decompose 3,263-line monolith into ~15 composable react-maplibre components. Zoning overlay moves to GPU-rendered deck.gl MVTLayer. Raster base maps replaced by self-hosted Protomaps PMTiles. 3D terrain via AWS Terrarium DEM.

**Tech Stack:** MapLibre GL JS 5.21, @vis.gl/react-maplibre 8.1, deck.gl 9.2, Protomaps PMTiles, AWS Terrarium DEM

**Design doc:** `docs/plans/2026-03-27-map-stack-modernization-design.md`

---

## Phase 1: Fix Zoning Rendering (URGENT — ship immediately)

The zoning tile layer renders at 0.3 fill-opacity. The parcel boundary layer below has dense yellow outlines at zoom 10-11 that drown out the zoning colors. The layer insert position (`ZONING_TILE_INSERT_BEFORE_LAYER_ID = "parcels-flood-layer"`) puts zoning between environmental overlays and parcel boundaries — correct in theory, but the opacity is too low and parcel tiles still dominate visually.

### Task 1.1: Boost zoning fill opacity and add outline

**Files:**
- Modify: `apps/web/components/maps/zoningLayerConfig.ts:269-287`
- Test: `apps/web/components/maps/zoningLayerConfig.test.ts`

**Step 1: Update `buildZoningTileLayer` paint properties**

In `zoningLayerConfig.ts`, change the `paint` object in `buildZoningTileLayer()`:

```typescript
// Before (line 282-285):
paint: {
  "fill-color": buildZoningTileColorExpression(contract.propertyName),
  "fill-opacity": 0.3,
},

// After:
paint: {
  "fill-color": buildZoningTileColorExpression(contract.propertyName),
  "fill-opacity": [
    "interpolate", ["linear"], ["zoom"],
    10, 0.55,
    13, 0.45,
    16, 0.35,
  ],
  "fill-outline-color": buildZoningTileColorExpression(contract.propertyName),
},
```

This makes zoning fills more visible at low zoom (0.55) and subtler at high zoom (0.35) where individual parcels are large enough to see colors. The outline reinforces the zoning boundary.

**Step 2: Delete the stale snapshot and run tests**

```bash
rm -f apps/web/components/maps/__snapshots__/zoningLayerConfig.test.ts.snap
npx vitest run apps/web/components/maps/zoningLayerConfig.test.ts --update
```

Expected: All tests pass, snapshot regenerated with new paint properties.

**Step 3: Commit**

```bash
git add apps/web/components/maps/zoningLayerConfig.ts apps/web/components/maps/zoningLayerConfig.test.ts apps/web/components/maps/__snapshots__/
git commit -m "fix(map): boost zoning fill opacity and add outline for visibility"
```

### Task 1.2: Dim parcel boundary layer when zoning is active

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx:1476-1501` (parcel-tiles-fill/line paint)
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx:1842-1883` (zoning tile effect)

**Step 1: Make parcel tile opacity respond to zoning state**

In the zoning tile useEffect (line 1842), after setting zoning layer visibility, also dim the parcel tiles when zoning is active:

```typescript
// After line 1877 (setLayerVisibilitySafe for ZONING_TILE_LAYER_ID):
// Dim parcel boundaries when zoning is active so colors are visible
const zoningActive = showLayers && showZoning && !!zoningTileContract;
if (map.getLayer("parcel-tiles-fill")) {
  map.setPaintProperty("parcel-tiles-fill", "fill-opacity", zoningActive ? 0.02 : 0.06);
}
if (map.getLayer("parcel-tiles-line")) {
  map.setPaintProperty("parcel-tiles-line", "line-opacity", zoningActive ? 0.3 : 0.7);
  map.setPaintProperty("parcel-tiles-line", "line-color", zoningActive ? "#a3a3a3" : "#facc15");
}
```

When zoning is on: parcel fill nearly transparent (0.02), outlines dim gray at 30%. When zoning is off: original yellow at full opacity.

**Step 2: Verify build passes**

```bash
npx vitest run apps/web/components/maps/ --reporter=verbose 2>&1 | tail -20
```

Expected: All map tests pass.

**Step 3: Commit**

```bash
git add apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "fix(map): dim parcel boundaries when zoning overlay is active"
```

### Task 1.3: Ensure zoning layer renders above parcel tiles

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx:1867-1879`

**Step 1: Fix layer insertion order**

The current code inserts zoning before `parcels-flood-layer` then moves it. Simplify to insert directly above `parcel-tiles-line`:

```typescript
// Replace lines 1870-1873:
map.addLayer(
  buildZoningTileLayer(zoningTileContract, showLayers && showZoning),
  "parcels-zoning-layer",  // insert just above GeoJSON zoning fallback
);

// Replace lines 1878-1879:
// Ensure zoning tiles are above parcel outlines but below flood/soils
moveLayerBeforeSafe(map, "parcels-zoning-layer", ZONING_TILE_LAYER_ID);
moveLayerBeforeSafe(map, "parcel-tiles-line", ZONING_TILE_LAYER_ID);
```

**Step 2: Commit**

```bash
git add apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "fix(map): ensure zoning layer renders above parcel tile outlines"
```

### Task 1.4: Deploy and verify zoning is visible

**Step 1: Delete .next cache and deploy**

```bash
rm -rf apps/web/.next
npx vercel --prod --archive=tgz --yes
```

**Step 2: Verify in browser**

Open `https://gallagherpropco.com/map?lat=30.451500&lng=-91.187100&z=13.00`.
Toggle Zoning overlay ON in workbench panel.
Expected: Colored zoning fills visible over parcels (green = residential, blue = commercial, purple = industrial).

**Step 3: Commit verification note**

```bash
git commit --allow-empty -m "chore: Phase 1 complete — zoning overlay verified on production"
```

---

## Phase 2: Protomaps Vector Base Map + Globe View

### Task 2.1: Install pmtiles and upgrade maplibre-gl

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install dependencies**

```bash
cd apps/web && pnpm add pmtiles@^4 && pnpm add maplibre-gl@^5.21.1 && cd ../..
```

**Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(deps): add pmtiles, upgrade maplibre-gl to 5.21"
```

### Task 2.2: Download and host Louisiana PMTiles extract

**Step 1: Download Protomaps Louisiana extract**

```bash
# Download from Protomaps — Louisiana bounding box
# This is done manually or via script; the PMTiles file goes to Cloudflare R2
# Approximate size: ~200-500MB for Louisiana region
```

Ref: https://docs.protomaps.com/pmtiles/

**Step 2: Upload to Cloudflare R2 bucket**

Create R2 bucket `gpc-map-tiles` and upload the PMTiles file. Enable public access via CF CDN.

**Step 3: Document the R2 URL in env vars**

Add `NEXT_PUBLIC_PMTILES_URL` to Vercel env (e.g., `https://tiles.gallagherpropco.com/louisiana.pmtiles`).

**Step 4: Commit any infra config**

```bash
git commit -m "infra: host Louisiana PMTiles on Cloudflare R2"
```

### Task 2.3: Register PMTiles protocol in the map component

**Files:**
- Create: `apps/web/components/maps/config/pmtilesProtocol.ts`
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx` (add protocol registration)

**Step 1: Create protocol registration module**

```typescript
// apps/web/components/maps/config/pmtilesProtocol.ts
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;

export function registerPmtilesProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}
```

**Step 2: Call `registerPmtilesProtocol()` before map initialization**

In `MapLibreParcelMap.tsx`, import and call at the top of the map init useEffect (line ~1374), before `new maplibregl.Map(...)`:

```typescript
import { registerPmtilesProtocol } from "./config/pmtilesProtocol";
// ... inside useEffect:
registerPmtilesProtocol();
```

**Step 3: Commit**

```bash
git add -f apps/web/components/maps/config/pmtilesProtocol.ts apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): register PMTiles protocol for vector base maps"
```

### Task 2.4: Create Protomaps style JSON and base map source

**Files:**
- Create: `apps/web/components/maps/config/protomapsStyle.ts`
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx` (swap base sources)

**Step 1: Create Protomaps style config**

```typescript
// apps/web/components/maps/config/protomapsStyle.ts
import type { StyleSpecification } from "maplibre-gl";

const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL
  ?? "https://tiles.gallagherpropco.com/louisiana.pmtiles";

/**
 * Protomaps dark style for vector base map.
 * Replaces raster OSM/ESRI/CartoDB tiles with styled vector tiles.
 */
export function getProtomapsDarkStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: '<a href="https://protomaps.com">Protomaps</a> | <a href="https://openstreetmap.org">OSM</a>',
      },
    },
    layers: [
      // Background
      { id: "background", type: "background", paint: { "background-color": "#1e2230" } },
      // Water
      { id: "water", type: "fill", source: "protomaps", "source-layer": "water", paint: { "fill-color": "#1a2535" } },
      // Land use
      { id: "landuse_park", type: "fill", source: "protomaps", "source-layer": "landuse", filter: ["==", "pmap:kind", "park"], paint: { "fill-color": "#1a2e1a" } },
      // Roads
      { id: "roads_minor", type: "line", source: "protomaps", "source-layer": "roads", filter: ["==", "pmap:kind", "minor_road"], paint: { "line-color": "#2a2e3a", "line-width": 0.5 } },
      { id: "roads_major", type: "line", source: "protomaps", "source-layer": "roads", filter: ["==", "pmap:kind", "major_road"], paint: { "line-color": "#3a3e4a", "line-width": 1 } },
      { id: "roads_highway", type: "line", source: "protomaps", "source-layer": "roads", filter: ["==", "pmap:kind", "highway"], paint: { "line-color": "#4a4e5a", "line-width": 1.5 } },
      // Buildings
      { id: "buildings", type: "fill", source: "protomaps", "source-layer": "buildings", paint: { "fill-color": "#252830", "fill-outline-color": "#2a2e38" }, minzoom: 14 },
      // Labels
      { id: "road_labels", type: "symbol", source: "protomaps", "source-layer": "roads", layout: { "text-field": "{name}", "text-size": 10, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#6b7280", "text-halo-color": "#1e2230", "text-halo-width": 1 }, minzoom: 14 },
      { id: "place_labels", type: "symbol", source: "protomaps", "source-layer": "places", layout: { "text-field": "{name}", "text-size": ["step", ["zoom"], 10, 8, 12, 12, 14], "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#9ca3af", "text-halo-color": "#1e2230", "text-halo-width": 1 }, minzoom: 6 },
    ],
  };
}
```

Note: The exact Protomaps source-layer names depend on the PMTiles schema version. Adjust `pmap:kind` filters based on the actual tile content. Test locally first.

**Step 2: Integrate into MapLibreParcelMap — replace raster sources with Protomaps**

This is a larger change. Replace the `streets`, `satellite`, `dark-carto` raster sources and `base-dark`, `base-streets`, `base-satellite` layers with the Protomaps vector style as the base, keeping satellite as an optional toggle.

**Step 3: Commit**

```bash
git add -f apps/web/components/maps/config/protomapsStyle.ts apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): add Protomaps dark vector base map"
```

### Task 2.5: Add globe projection toggle

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx` (map init options)
- Modify: `apps/web/components/maps/MapWorkbenchPanel.tsx` (add globe toggle)

**Step 1: Add globe projection to map init**

In the `new maplibregl.Map()` options (line ~1379), add:

```typescript
projection: "globe",
```

MapLibre automatically transitions from globe to mercator as zoom increases past ~4.

**Step 2: Commit**

```bash
git add apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): enable globe projection for overview zoom"
```

### Task 2.6: Deploy Phase 2

```bash
rm -rf apps/web/.next
npx vercel --prod --archive=tgz --yes
git commit --allow-empty -m "chore: Phase 2 complete — vector base maps + globe view"
```

---

## Phase 3: react-maplibre Refactor

This is the largest phase. Each task creates one component file, tests it, and wires it into the new `MapContainer`.

### Task 3.1: Install @vis.gl/react-maplibre

```bash
cd apps/web && pnpm add @vis.gl/react-maplibre@^8.1.0 && cd ../..
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(deps): add @vis.gl/react-maplibre"
```

### Task 3.2: Create MapContainer shell

**Files:**
- Create: `apps/web/components/maps/MapContainer.tsx`
- Create: `apps/web/components/maps/hooks/useMapViewState.ts`
- Test: `apps/web/components/maps/MapContainer.test.tsx`

Create the minimal `<Map>` wrapper with viewState management, CSS import, and PMTiles protocol registration. Children are rendered inside the map context.

### Task 3.3: Create ParcelBoundaryLayer

**Files:**
- Create: `apps/web/components/maps/layers/ParcelBoundaryLayer.tsx`
- Test: `apps/web/components/maps/layers/ParcelBoundaryLayer.test.tsx`

Declarative `<Source type="vector">` + `<Layer type="fill">` + `<Layer type="line">` for Martin MVT parcel outlines.

### Task 3.4: Create ZoningDeckLayer (placeholder — native MapLibre)

**Files:**
- Create: `apps/web/components/maps/layers/ZoningDeckLayer.tsx`

Initially uses native MapLibre `<Source>` + `<Layer>` with the proxy tile URL. Will be migrated to deck.gl MVTLayer in Phase 4.

### Task 3.5: Create environmental overlay layers

**Files:**
- Create: `apps/web/components/maps/layers/FloodZoneLayer.tsx`
- Create: `apps/web/components/maps/layers/SoilsLayer.tsx`
- Create: `apps/web/components/maps/layers/WetlandsLayer.tsx`
- Create: `apps/web/components/maps/layers/EpaFacilitiesLayer.tsx`

Each follows the same pattern: `<Source type="vector" tiles={[martinUrl]}>` + `<Layer>` with paint properties extracted from the monolith.

### Task 3.6: Create SelectedParcelsLayer + ParcelPointsLayer

**Files:**
- Create: `apps/web/components/maps/layers/SelectedParcelsLayer.tsx`
- Create: `apps/web/components/maps/layers/ParcelPointsLayer.tsx`

GeoJSON sources with dynamic data. The `useMemo` computations for boundary/zoning/flood/point sources move here.

### Task 3.7: Extract DrawTool and MeasureTool

**Files:**
- Create: `apps/web/components/maps/interactions/DrawTool.tsx`
- Create: `apps/web/components/maps/interactions/MeasureTool.tsx`

Extract the 6 drawing-related useEffects and the `MapLibreMeasureTool` inline component.

### Task 3.8: Extract ParcelClickHandler and ParcelPopup

**Files:**
- Create: `apps/web/components/maps/interactions/ParcelClickHandler.tsx`
- Create: `apps/web/components/maps/interactions/ParcelPopup.tsx`

Parcel click/hover events, selection logic, popup presentation.

### Task 3.9: Extract tool sub-components

**Files:**
- Create: `apps/web/components/maps/layers/CompSalesLayer.tsx`
- Create: `apps/web/components/maps/layers/HeatmapDeckLayer.tsx`
- Create: `apps/web/components/maps/layers/IsochroneLayer.tsx`

Move `MapLibreCompSaleLayer`, `MapLibreHeatmapLayer`, `MapLibreIsochroneControl` to their own files.

### Task 3.10: Wire MapContainer with all layers + feature flag

**Files:**
- Modify: `apps/web/app/map/page.tsx` (or wherever MapLibreParcelMap is rendered)

Add feature flag: `NEXT_PUBLIC_MAP_V2=true` renders new `<MapContainer>`, otherwise renders old `<MapLibreParcelMap>`. Both accept the same props.

### Task 3.11: E2e smoke test + deploy

Run existing e2e tests with `NEXT_PUBLIC_MAP_V2=true`. Verify parcels, zoning, selection, popups all work. Deploy behind feature flag.

```bash
git commit -m "feat(map): Phase 3 complete — react-maplibre refactor behind MAP_V2 flag"
```

---

## Phase 4: deck.gl Overlays

### Task 4.1: Install deck.gl packages

```bash
cd apps/web && pnpm add @deck.gl/core@^9.2 @deck.gl/layers@^9.2 @deck.gl/geo-layers@^9.2 @deck.gl/mapbox@^9.2 && cd ../..
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(deps): add deck.gl packages"
```

### Task 4.2: Create DeckOverlayProvider

**Files:**
- Create: `apps/web/components/maps/layers/DeckOverlayProvider.tsx`
- Create: `apps/web/components/maps/hooks/useDeckLayers.ts`

Wrapper that uses `useControl` + `MapboxOverlay` with `interleaved: true`.

### Task 4.3: Create zoningColors config

**Files:**
- Create: `apps/web/components/maps/config/zoningColors.ts`

Export `ZONING_COLOR_MAP: Record<string, [number, number, number, number]>` mapping zoning_type codes to RGBA arrays. Plus `getZoningFillColor(zoningType: string): [number, number, number, number]` fallback function for prefix matching (M1→purple, C→blue, R→green, etc.).

### Task 4.4: Migrate ZoningDeckLayer to deck.gl MVTLayer

**Files:**
- Modify: `apps/web/components/maps/layers/ZoningDeckLayer.tsx`

Replace native MapLibre `<Source>` + `<Layer>` with deck.gl `MVTLayer`:

```typescript
new MVTLayer({
  id: 'zoning-tiles',
  data: '/api/map/zoning-tiles/{z}/{x}/{y}',
  minZoom: 10,
  maxZoom: 22,
  getFillColor: (feature) => getZoningFillColor(feature.properties.zoning_type),
  getLineColor: [80, 80, 80, 60],
  getLineWidth: 1,
  lineWidthMinPixels: 0.5,
  pickable: true,
  autoHighlight: true,
  highlightColor: [255, 255, 255, 60],
  uniqueIdProperty: 'parcel_id',
  binary: true,
})
```

### Task 4.5: Create HeatmapDeckLayer with deck.gl

**Files:**
- Modify: `apps/web/components/maps/layers/HeatmapDeckLayer.tsx`

Replace the inline `MapLibreHeatmapLayer` with deck.gl `HeatmapLayer`.

### Task 4.6: Deploy and verify

Deploy, verify zoning colors are vivid and properly layered. No more opacity/ordering issues.

```bash
git commit -m "feat(map): Phase 4 complete — deck.gl zoning + heatmap overlays"
```

---

## Phase 5: 3D Terrain

### Task 5.1: Create terrainConfig

**Files:**
- Create: `apps/web/components/maps/config/terrainConfig.ts`

```typescript
export const TERRAIN_DEM_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_SOURCE_ID = "terrain-dem";
export const TERRAIN_ENCODING = "terrarium";
export const DEFAULT_EXAGGERATION = 1.5;
export const MIN_EXAGGERATION = 0.5;
export const MAX_EXAGGERATION = 3.0;
```

### Task 5.2: Create TerrainControl component

**Files:**
- Create: `apps/web/components/maps/controls/TerrainControl.tsx`

Adds raster-DEM source + calls `map.setTerrain()`. Includes exaggeration slider in UI.

### Task 5.3: Wire terrain toggle in MapWorkbenchPanel

**Files:**
- Modify: `apps/web/components/maps/MapWorkbenchPanel.tsx`

Add "3D Terrain" toggle + exaggeration slider to the overlay panel.

### Task 5.4: Deploy and verify

```bash
git commit -m "feat(map): Phase 5 complete — 3D terrain with AWS DEM tiles"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| 1 | 1.1–1.4 | Zoning overlay visible on production |
| 2 | 2.1–2.6 | Vector base maps + globe view |
| 3 | 3.1–3.11 | react-maplibre component decomposition |
| 4 | 4.1–4.6 | deck.gl GPU zoning + heatmaps |
| 5 | 5.1–5.4 | 3D terrain with elevation |
