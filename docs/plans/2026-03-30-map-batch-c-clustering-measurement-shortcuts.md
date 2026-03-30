# Batch C: Clustering, Measurement Tools, Keyboard Shortcuts

**Status:** Planned | **Effort:** 6-9 hours | **Dependencies:** None (independent of Batch B)

## P6: Clustering at Low Zoom (2-3 hours)

### Files
- **Modify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (lines ~1510, ~1814-1828)
- **Modify:** `apps/web/components/maps/mapLibreAdapter.ts` (add cluster click handler)

### Technical Approach
Use MapLibre's built-in GeoJSON cluster support on the `parcel-point-source`.

### Cluster Config
```typescript
"parcel-point-source": {
  type: "geojson",
  data: parcelPointsGeoJson,
  cluster: true,
  clusterMaxZoom: 13,
  clusterRadius: 50,
}
```

### New Layers (add before `parcel-points`)
1. `parcel-clusters` (type: circle) — sized by point_count: 25px (2-10), 35px (11-50), 45px (51+)
2. `parcel-cluster-count` (type: symbol) — white text count label centered on cluster

### Interaction
- Click cluster -> `map.flyTo({ center, zoom: zoom + 2 })`
- Existing `parcel-points` layer gets filter: `["!", ["has", "point_count"]]` to hide clustered points

### Zoom Thresholds
- z < 11: Clusters only
- z 11-13: Transition (both visible)
- z >= 13: Individual points only

---

## P7: Drawing & Measurement Tools (3-4 hours)

### Files
- **Modify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (lines ~785, ~2437-2704)
- **Optional create:** `apps/web/components/maps/measurementUtils.ts` (extract formatters)

### Current State
- Polygon drawing: **fully functional** (lines 656-914, keyboard "D" shortcut)
- Measurement tool: **80% done** — MapLibreMeasureTool component (lines 2437-2704) has distance + area calculation
- **Gap:** No auto-area readout when polygon drawing completes

### Changes
1. **Auto-measure on polygon close** (P7.1): After `finishDrawing()` calls `onPolygonDrawn()`, compute area and show in status bar or toast
2. **Unit formatting** (P7.2): Distance: feet < 5280 -> feet, else miles. Area: sq ft < 43560 -> sq ft, else acres
3. **Export formatters** (P7.3): Extract `formatDistance()`, `formatArea()`, `polygonAreaSquareMeters()`, `haversineDistanceMeters()` for reuse

### No New Dependencies
- Turf.js NOT needed — custom haversine + shoelace implementations already exist and are tested
- `@turf/area` is NOT in package.json and should not be added

### HUD Display
- Measurement results in existing right-side overlay (line 2652), positioned `right-16 top-2`
- Optional: summary row in bottom status bar when measurement mode active

---

## P8: Keyboard Shortcuts (1-2 hours)

### Files
- **Modify:** `apps/web/app/map/MapPageClient.tsx` (lines 389-401, existing `handleKeyDown`)
- **Verify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (map init — confirm `keyboard: true`)

### New Shortcuts
| Key | Action | Implementation |
|-----|--------|---------------|
| `+` / `=` | Zoom in | `mapRef.current?.zoomIn()` |
| `-` / `_` | Zoom out | `mapRef.current?.zoomOut()` |
| `Escape` | Deselect all | `setInternalSelectedParcelIds(new Set())` |
| Arrow keys | Pan map | MapLibre native (verify `keyboard: true` in init) |

### Guard
Existing pattern: skip if `event.target.tagName` is INPUT/TEXTAREA/SELECT.

### Edge Cases
- NumPad +/- may fire different key codes — test
- Mac vs Windows minus key handling
- Ensure no conflict with existing `[` key (sidebar toggle) or MapLibre Esc behavior

---

## Implementation Order
1. **P8 (keyboard)** — 1-2 hrs, quick win, unblocked
2. **P6 (clustering)** — 2-3 hrs, independent
3. **P7 (measurement)** — 3-4 hrs, refines existing code

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- Manual: zoom < 11 shows clusters, click cluster zooms, draw polygon shows area, +/- zoom, Esc deselects
