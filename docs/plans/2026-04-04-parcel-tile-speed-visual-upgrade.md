# Parcel Tile Speed + Visual Upgrade

**Date:** 2026-04-04
**Status:** Approved

## Problem

1. **Speed:** Every tile request proxies through a Vercel serverless function (`/api/map/tiles/{z}/{x}/{y}`), adding 150-300ms cold start latency per tile. A typical viewport loads 16-64 tiles, making the map feel sluggish.
2. **Visual:** Parcel boundaries render as faint yellow outlines with 6% fill opacity — nearly invisible on satellite imagery. No data-driven coloring despite tile features containing `zoning_type`, `flood_zone`, and `area_sqft`.

## Design

### Part 1: Direct Tile Loading (Speed)

**Before:**
```
Browser → Vercel Function (cold start) → Cloudflare Edge → CF Tunnel → Martin → PostGIS
```

**After:**
```
Browser → Cloudflare Edge Cache (hit: 5-20ms) → CF Tunnel → Martin (miss only)
```

**Changes:**
- Switch MapLibre tile source URL from `/api/map/tiles/{z}/{x}/{y}` to `https://tiles.gallagherpropco.com/ebr_parcels.1/{z}/{x}/{y}`
- Add Cloudflare Transform Rule on `tiles.gallagherpropco.com`:
  - `Access-Control-Allow-Origin: https://gallagherpropco.com`
  - `Access-Control-Allow-Methods: GET`
  - `Cache-Control: public, max-age=86400, stale-while-revalidate=604800, immutable`
- Keep Vercel proxy route intact as fallback (no deletion)
- Update `tileUrls.ts` — `getParcelTileUrl()` returns direct Martin URL instead of same-origin proxy
- Update `MapLibreParcelMap.tsx` initial style sources to use direct URL

**Expected impact:**
- First load: ~50-100ms (CF Tunnel → Martin, no Vercel hop)
- Cached load: ~5-20ms (Cloudflare edge)
- Cold start eliminated entirely

### Part 2: Data-Driven Parcel Coloring (Visual)

All coloring uses MapLibre `match` / `interpolate` expressions on existing tile feature properties — zero extra API calls.

**Default mode: Zoning**

| Zone Pattern | Color | Hex |
|---|---|---|
| M1, M2 (Industrial) | Slate blue | `#6366f1` |
| C1-C5 (Commercial) | Amber | `#f59e0b` |
| A1-A5, RE (Residential) | Emerald | `#10b981` |
| B1 (Buffer/Transition) | Cool gray | `#9ca3af` |
| PUD (Planned Unit) | Violet | `#8b5cf6` |
| Unknown/empty | Neutral | `#d4d4d4` |

**Switchable modes:**
- **Flood risk:** green (X) → amber (X500) → coral (AE, A)
- **Acreage:** graduated light→dark blue by `area_sqft` bands

**Zoom-dependent styling:**

| Zoom Range | Line Width | Fill Opacity | Notes |
|---|---|---|---|
| 10-12 | 1px | 10% | Context only |
| 13-15 | 1.5px | 18% | Working zoom |
| 16+ | 2px | 25% | Crisp detail |

**Hover effect:** Bump fill to 40% opacity + white 2px border via MapLibre feature state.

**UI control:** Small segmented control (`Zoning | Flood | Size`) near the existing layer toggle. Minimal chrome.

### Files Changed

| File | Change |
|---|---|
| `apps/web/components/maps/tileUrls.ts` | `getParcelTileUrl()` returns direct Martin URL |
| `apps/web/components/maps/MapLibreParcelMap.tsx` | Direct tile URL in style, data-driven paint expressions, hover state, zoom-dependent styling |
| `apps/web/components/maps/layers/ParcelBoundaryLayer.tsx` | Data-driven fill/line paint, color mode prop |
| `apps/web/components/maps/layers/ParcelExtrusionLayer.tsx` | Direct tile URL |
| `apps/web/components/maps/SplitMapCompare.tsx` | Direct tile URL |
| `apps/web/components/maps/mapLibreAdapter.ts` | Hover feature state handling |
| New: `apps/web/components/maps/parcelColorExpressions.ts` | Shared MapLibre paint expressions for zoning/flood/acreage modes |
| New: `apps/web/components/maps/ParcelColorModeControl.tsx` | Segmented control UI component |
| Cloudflare Dashboard | Transform Rule for CORS + cache headers on `tiles.gallagherpropco.com` |

### Risks

- **CORS:** If Cloudflare Transform Rule isn't applied correctly, tiles fail to load cross-origin. Mitigation: keep Vercel proxy as fallback.
- **Cache invalidation:** If parcel data is updated, cached tiles serve stale data for up to 24h. Acceptable for now — parcels change infrequently.
- **Martin `source-layer` name:** The `ebr_parcels.1` source-layer must match in both the tile URL and MapLibre layer config. Verified via Martin metadata endpoint.
