# Map Stack Modernization Design

**Date:** 2026-03-27
**Status:** Approved
**Branch:** TBD (feat/map-modernization)

## Problem

The map component (`MapLibreParcelMap.tsx`) is a 3,263-line monolith with 36 useEffect hooks, 20+ useState variables, and 12 sources interleaved with 15+ layers. The zoning overlay has been broken for weeks due to layer ordering/opacity issues that are extremely hard to diagnose in this tangled architecture. The current stack uses raster base maps (OSM/ESRI) and raw imperative MapLibre API calls, missing modern features like 3D terrain, globe view, and GPU-accelerated overlays.

## Current Stack

- **MapLibre GL JS** ^5.20.1 (nearly latest — 5.21.1 is current)
- **No React wrapper** — raw imperative `maplibregl.Map` constructor + `map.addSource/addLayer`
- **Raster base maps** — OSM tiles (streets), ESRI (satellite), CartoDB (dark)
- **Martin MVT** for parcel/environmental overlays via Cloudflare Tunnel
- **GeoJSON** for selected parcels, flood zones, draw tool
- **31 map files**, ~9,700 total lines

## Target Stack

- **MapLibre GL JS** ^5.21.1
- **@vis.gl/react-maplibre** ^8.1.0 — declarative React wrapper
- **deck.gl** ^9.2.11 — GPU-accelerated overlays (zoning, heatmaps)
- **Protomaps PMTiles** — self-hosted vector base maps on Cloudflare R2
- **AWS Terrarium DEM** — free 3D terrain tiles
- **Martin MVT** — unchanged for parcel/environmental data

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  MapPage (page layout, panels, copilot)             │
├─────────────────────────────────────────────────────┤
│  <MapContainer>                                      │
│    @vis.gl/react-maplibre <Map>                      │
│    ├── <VectorBaseMap />           (Protomaps PMT)   │
│    ├── <ParcelBoundaryLayer />     (Martin MVT)      │
│    ├── <FloodZoneLayer />          (Martin MVT)      │
│    ├── <SoilsLayer />              (Martin MVT)      │
│    ├── <WetlandsLayer />           (Martin MVT)      │
│    ├── <EpaFacilitiesLayer />      (Martin MVT)      │
│    ├── <SelectedParcelsLayer />    (GeoJSON)         │
│    ├── <DeckOverlayProvider>                         │
│    │   ├── <ZoningDeckLayer />     (deck.gl MVT)    │
│    │   └── <HeatmapDeckLayer />    (deck.gl)        │
│    ├── <ParcelClickHandler />                        │
│    ├── <ParcelPopup />                               │
│    ├── <DrawTool />                                  │
│    └── <TerrainControl />          (AWS DEM)         │
├─────────────────────────────────────────────────────┤
│  MapLibre GL JS 5.21 + deck.gl 9.2                   │
│  Protomaps vector base (PMTiles on CF R2)            │
│  Martin MVT for parcel/overlay data                  │
└─────────────────────────────────────────────────────┘
```

### Key Decisions

1. **react-maplibre over raw API** — Declarative `<Source>` + `<Layer>` JSX. Each overlay is one component file (~50-150 lines). Style diffing handled by the library. No more imperative `map.addSource/addLayer/setLayoutProperty` calls.

2. **deck.gl MVTLayer for zoning** — GPU-rendered with `getFillColor` callback for categorical zoning colors. `MapboxOverlay` with `interleaved: true` renders into MapLibre's WebGL context for proper z-ordering with native layers. Eliminates the current opacity/ordering bug.

3. **Protomaps PMTiles for base maps** — Self-hosted on Cloudflare R2 (free). Vector base map with styled street labels, building footprints, POIs. Replaces raster OSM/ESRI tiles. No API key, no per-tile cost, no rate limits.

4. **AWS Terrarium for 3D terrain** — Free DEM tiles at `elevation-tiles-prod.s3.amazonaws.com`. MapLibre's native `setTerrain()` with exaggeration control. Gives elevation context for flood/drainage analysis.

5. **Globe projection** — MapLibre's `projection: "globe"` for the initial zoom-out experience. Transitions to Mercator at zoom ~4.

## Component Decomposition

### Current Monolith (to be deleted)
- `MapLibreParcelMap.tsx` — 3,263 lines, 12 sources, 15+ layers, 36 useEffect hooks, 20+ useState, 6 inline sub-components

### Target Structure

```
apps/web/components/maps/
├── MapContainer.tsx              # react-maplibre <Map>, viewState, projection
├── layers/
│   ├── VectorBaseMap.tsx          # Protomaps PMTiles source + style
│   ├── ParcelBoundaryLayer.tsx    # Martin MVT parcel outlines
│   ├── ZoningDeckLayer.tsx        # deck.gl MVTLayer zoning fills
│   ├── FloodZoneLayer.tsx         # FEMA flood MVT + GeoJSON fallback
│   ├── SoilsLayer.tsx             # Soils MVT
│   ├── WetlandsLayer.tsx          # Wetlands MVT
│   ├── EpaFacilitiesLayer.tsx     # EPA circles MVT
│   ├── SelectedParcelsLayer.tsx   # GeoJSON selected boundaries
│   ├── ParcelPointsLayer.tsx      # GeoJSON centroids
│   ├── HeatmapDeckLayer.tsx       # deck.gl heatmap
│   ├── CompSalesLayer.tsx         # Comp sale markers
│   ├── IsochroneLayer.tsx         # Drive-time isochrones
│   └── DeckOverlayProvider.tsx    # useControl + MapboxOverlay
├── interactions/
│   ├── DrawTool.tsx               # Polygon draw (extracted from ~150 inline lines)
│   ├── MeasureTool.tsx            # Distance/area measure
│   ├── ParcelClickHandler.tsx     # Click-to-select + popup trigger
│   └── ParcelPopup.tsx            # Hover/click popup
├── controls/
│   ├── TerrainControl.tsx         # 3D terrain toggle + exaggeration
│   ├── GlobeControl.tsx           # Globe/mercator toggle
│   └── LayerPanel.tsx             # Overlay toggles (from workbench)
├── hooks/
│   ├── useMapViewState.ts         # viewState, URL params, persistence
│   ├── useParcelSelection.ts     # Selection state, geometry loading
│   ├── useZoningContract.ts       # Zoning tile contract resolution
│   └── useDeckLayers.ts           # Assemble deck.gl layers from state
├── config/
│   ├── tileUrls.ts                # (existing, updated)
│   ├── zoningColors.ts            # zoning_type → [r,g,b,a] map
│   ├── mapStyles.ts               # (existing, updated)
│   └── terrainConfig.ts           # DEM source, exaggeration defaults
└── MapWorkbenchPanel.tsx          # (existing, simplified)
```

### MapContainer Pattern

```tsx
<Map
  mapStyle={protomapsStyle}
  initialViewState={{ longitude: -91.18, latitude: 30.45, zoom: 11 }}
  projection={globeEnabled ? "globe" : "mercator"}
  terrain={terrainEnabled ? { source: "dem", exaggeration: 1.5 } : undefined}
>
  <VectorBaseMap />
  <ParcelBoundaryLayer visible={showParcels} />
  <FloodZoneLayer visible={showFlood} />
  <SoilsLayer visible={showSoils} />
  <WetlandsLayer visible={showWetlands} />
  <EpaFacilitiesLayer visible={showEpa} />
  <SelectedParcelsLayer parcels={selected} geometries={geos} />
  <DeckOverlayProvider interleaved>
    <ZoningDeckLayer visible={showZoning} />
    <HeatmapDeckLayer visible={showHeatmap} data={scores} />
  </DeckOverlayProvider>
  <DrawTool active={drawing} onFinish={handlePolygon} />
  <ParcelClickHandler onSelect={handleSelect} />
  <ParcelPopup />
  {terrainEnabled && <TerrainControl exaggeration={exaggeration} />}
</Map>
```

## Zoning Layer Fix (Phase 1 — Immediate)

The current bug: `zoning-tiles-fill` renders at `fill-opacity: 0.3` while `parcel-tiles-fill` below has yellow fill + outlines. At zoom 10-11 the dense yellow drowns out the semi-transparent zoning colors.

**Immediate fix (before refactor):**
1. Boost zoning `fill-opacity` 0.3 → 0.6
2. Add `fill-outline-color` matching zoning color at higher opacity
3. Ensure layer ordering: zoning above parcel-tiles-fill/line
4. At zoom < 12, reduce parcel boundary opacity so zoning dominates

**Post-refactor (Phase 4):** deck.gl MVTLayer with `getFillColor` returning `[r, g, b, 180]` in interleaved mode. Layer ordering handled automatically.

## deck.gl Integration Detail

### ZoningDeckLayer

```tsx
new MVTLayer({
  id: 'zoning-tiles',
  data: '/api/map/zoning-tiles/{z}/{x}/{y}',
  minZoom: 10,
  maxZoom: 22,
  getFillColor: (feature) => {
    const zt = feature.properties.zoning_type;
    return ZONING_COLOR_MAP[zt] ?? ZONING_COLOR_MAP._fallback(zt);
  },
  pickable: true,
  autoHighlight: true,
  uniqueIdProperty: 'parcel_id',
  binary: true,  // default in deck.gl 9, better perf
})
```

### DeckOverlayProvider

```tsx
function DeckOverlayProvider({ children, interleaved = true }) {
  const layers = useDeckLayers(); // assembles from children
  useControl(
    () => new MapboxOverlay({ interleaved, layers }),
    { position: 'top-left' }
  );
  // Update layers reactively
  return children;
}
```

## Base Map: Protomaps PMTiles

- **Source:** Download Protomaps planet extract for Louisiana region (~500MB)
- **Host:** Cloudflare R2 bucket (free egress via CF CDN)
- **Client:** `pmtiles` npm package registers a protocol handler with MapLibre
- **Style:** Protomaps provides ready-made dark/light styles matching the current theme
- **Fallback:** Keep raster OSM/ESRI as fallback if PMTiles fails to load

## 3D Terrain

- **DEM Source:** AWS Terrarium — `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`
- **Encoding:** `terrarium` (MapLibre native support)
- **Control:** Toggle in workbench panel + exaggeration slider (0.5x — 3x)
- **Use case:** Flood/drainage analysis — see elevation differences in flat Louisiana terrain

## Phase Plan

| Phase | Scope | Days | Ships Independently |
|-------|-------|------|-------------------|
| 1 | Fix zoning rendering (opacity + ordering) | 1 | Yes |
| 2 | Protomaps vector base map + globe view | 2 | Yes |
| 3 | react-maplibre refactor (decompose monolith) | 4 | Yes (feature flag) |
| 4 | deck.gl overlays (zoning MVTLayer, heatmap) | 3 | Yes |
| 5 | 3D terrain (AWS DEM + controls) | 2 | Yes |

**Phases 1-2 are independent of 3-5.** Phase 1 ships immediately on the current architecture. Phase 2 adds vector base maps. Phases 3-5 are the refactor chain — Phase 3 rewrites the component, Phase 4 adds deck.gl, Phase 5 adds terrain.

## New Dependencies

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `@vis.gl/react-maplibre` | ^8.1.0 | ~45KB | React wrapper for MapLibre |
| `@deck.gl/core` | ^9.2.11 | ~180KB | deck.gl core |
| `@deck.gl/layers` | ^9.2.11 | ~120KB | GeoJSON, scatterplot layers |
| `@deck.gl/geo-layers` | ^9.2.11 | ~90KB | MVTLayer, TileLayer |
| `@deck.gl/mapbox` | ^9.2.11 | ~15KB | MapboxOverlay integration |
| `pmtiles` | ^4.x | ~12KB | PMTiles protocol handler |
| `maplibre-gl` | ^5.21.1 | (upgrade) | Latest MapLibre |

**Total new bundle:** ~460KB (tree-shakeable, code-split per route)

## Testing Strategy

- **Unit tests:** Each layer component gets a test with mocked MapLibre context
- **Integration:** Zoning tile request returns 200 + correct content-type
- **E2e smoke:** Map loads, parcel tiles appear, zoning colors visible at z14, click-select works
- **Visual regression:** Screenshot comparison at z10, z13, z16 with zoning enabled

## Risk Mitigation

- Phase 1 (zoning fix) ships on current arch — zero regression risk
- Phase 2 (base map) keeps raster tiles as fallback source
- Phase 3 (react-maplibre) keeps old component until new one passes all e2e tests, then swap via feature flag (`NEXT_PUBLIC_MAP_V2=true`)
- Phase 4 (deck.gl) is additive — native MapLibre layers remain as fallback
- Phase 5 (terrain) is purely additive, default off

## Sources

- [MapLibre GL JS 5.21.1](https://github.com/maplibre/maplibre-gl-js/releases)
- [@vis.gl/react-maplibre v8.1.0](https://visgl.github.io/react-maplibre/)
- [deck.gl 9.2.11 MVTLayer](https://deck.gl/docs/api-reference/geo-layers/mvt-layer)
- [deck.gl MapboxOverlay](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay)
- [Protomaps PMTiles](https://docs.protomaps.com/pmtiles/)
- [AWS Terrarium DEM](https://elevation-tiles-prod.s3.amazonaws.com)
- [MapLibre 3D Terrain](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- [MapLibre Globe Projection](https://maplibre.org/maplibre-gl-js/docs/examples/)
