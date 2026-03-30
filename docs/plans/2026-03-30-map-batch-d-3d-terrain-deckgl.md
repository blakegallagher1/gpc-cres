# Batch D: 3D Terrain / Globe Projection with deck.gl

**Status:** Planned | **Effort:** 40-60 hours | **Timeline:** 4-6 weeks | **Risk:** Medium

## Decision: Approach (a) — Migrate /map to MapContainerV2

MapContainerV2 already exists with react-maplibre, deck.gl, terrain control, and globe projection. Migrating is more practical than bolting terrain onto the 3400-line MapLibreParcelMap.

### Why (a) over (b)
- Terrain already functional in V2 (AWS Terrarium DEM)
- Declarative layer architecture (easier to test)
- Unlocks deck.gl GPU-accelerated layers (heatmaps, 3D buildings)
- 7 react-maplibre layer components already production-ready

## Phase 1: Inventory & Gap Analysis (6-8 hours)

Map all MapLibreParcelMap behaviors to V2 equivalents:
- Parcel rendering, popups, selection, highlights
- Drawing (polygon sketch, undo, clear)
- 6 overlays (parcels, zoning, flood, soils, wetlands, EPA)
- Heatmaps, isochrones, measurement tools
- Workbench panel integration, base-layer switching

**Gaps in V2:** Popup interaction, selection UI, drawing controls, measurement, isochrone, heatmap renderers.

## Phase 2: Extend Layer Components (12-16 hours)

Create missing layers in `apps/web/components/maps/layers/`:
- `HeatmapLayer.tsx` — GeoJSON heatmap paint layer
- `IsochroneLayer.tsx` — Drive-time polygon overlay
- `MeasurementLayer.tsx` — Distance/area visual feedback
- `TrajectoryChoroplethLayer.tsx` — Market velocity choropleth
- `CompsMarkerLayer.tsx` — Comparable sales markers

Create reusable hooks:
- `useMapPopups.ts` — Click detection, popup positioning, action dispatch
- `useMapSelection.ts` — Track selectedIds, highlightIds, dispatch changes

## Phase 3: MapPageV2 Bridge Component (10-14 hours)

Create `apps/web/components/maps/MapPageV2.tsx` (~300-500 lines):
- Accepts all MapLibreParcelMap props
- Manages workbench panel state
- Wires up callbacks (onParcelClick, onPolygonDrawn, etc.)
- Integrates DrawingControl + MeasurementControl
- Handles viewport <-> URL param sync

## Phase 4: Parallel Routing & Safe Cutover (8-10 hours)

### Feature Flag
```env
NEXT_PUBLIC_MAP_USE_V2=false  # default off
```

In `ParcelMap.tsx`, conditionally render MapLibreParcelMap OR MapPageV2.

### Rollout
- Day 1: Deploy with flag=false, 10% on V2 (via query param)
- Day 2-3: 50% (monitor errors + perf)
- Day 4-5: 100% if no regressions
- Keep flag for 2+ weeks for fast rollback

## Phase 5: Terrain & Performance (6-8 hours)

### Terrain Source
AWS Terrarium DEM (already configured): `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`
- No API key needed (public S3 bucket)
- Sufficient resolution for parcel-scale

### Performance Targets
| Metric | Current | Target | Delta |
|--------|---------|--------|-------|
| FCP | ~1.5s | ~1.3s | -13% |
| GPU VRAM (terrain on) | N/A | +45-60 MB | Acceptable iPhone 12+ |

### Mobile Guard
If terrain causes >15% perf regression on mobile: lazy-load behind explicit toggle (default off).

## Phase 6: 3D Buildings (Design Only)

Deferred to future batch. Requires:
- Building height data from property DB
- deck.gl GeoJsonLayer with `extruded: true`
- Max 10k buildings per viewport at z18+

## Critical Files

### Existing (modify)
- `apps/web/components/maps/MapContainerV2.tsx` (177 lines)
- `apps/web/components/maps/layers/` (extend with 5 new layers)
- `apps/web/components/maps/ParcelMap.tsx` (add feature flag routing)
- `apps/web/components/maps/MapLibreParcelMap.tsx` (source of truth for porting)

### New (create)
- `apps/web/components/maps/MapPageV2.tsx` (300-500 lines)
- `apps/web/components/maps/hooks/useMapPopups.ts` (150-200 lines)
- `apps/web/components/maps/hooks/useMapSelection.ts` (100-150 lines)
- 5 new layer components in `layers/` (100-200 lines each)
- 2 new control components (DrawingControl, MeasurementControl)

## No New Dependencies
All required packages already installed:
- `@deck.gl/core@^9.2`, `@deck.gl/geo-layers@^9.2`, `@deck.gl/layers@^9.2`
- `@vis.gl/react-maplibre@^8`
- `maplibre-gl@^5.21.1`, `pmtiles@^4`

## Risk & Rollback
- **Rollback time:** <5 min (set `NEXT_PUBLIC_MAP_USE_V2=false`, redeploy)
- **No data loss:** Both renderers read same source data
- **Keep MapLibreParcelMap for 4+ weeks** after V2 goes to 100%
