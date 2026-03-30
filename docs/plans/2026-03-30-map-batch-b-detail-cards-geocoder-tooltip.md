# Batch B: Parcel Detail Cards, Address Geocoder, Hover Tooltip

**Status:** Planned | **Effort:** 14-24 hours | **Dependencies:** None (Batch A complete)

## P2: Parcel Click -> Detail Card (5-8 hours)

### Files
- **Create:** `apps/web/components/maps/ParcelDetailCard.tsx` (~250 lines)
- **Modify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (lines ~1920-1950, ~3450)
- **No changes to:** `mapLibreAdapter.ts` (existing handlers work)

### Design
Floating card on parcel click showing address, owner, acreage, zoning, flood zone. Tabs for Details/Comps/Deals. Action buttons: "Create Deal", "View Comps", "Screen Parcel".

### State
```typescript
const [detailCardParcel, setDetailCardParcel] = useState<MapParcel | null>(null);
const [detailCardPosition, setDetailCardPosition] = useState({ x: 0, y: 0 });
```

### Data Flow
1. User clicks parcel -> `mapLibreAdapter.handleFeatureClick` fires
2. Calls `params.openParcelPopup(parcel, lngLat)`
3. MapLibreParcelMap sets `detailCardParcel` + `detailCardPosition`
4. `ParcelDetailCard` renders with animation
5. User clicks action -> `handlePopupAction` processes

### Integration
- Hooks into existing `openParcelPopup` callback
- Reuses `handlePopupAction` (line 1115-1138)
- Uses Framer Motion for entry/exit animation
- Portal rendering recommended to avoid z-index issues

---

## P4: Address Geocoder (5.5-9 hours)

### Files
- **Create:** `apps/web/components/maps/MapGeocoder.tsx` (~180 lines)
- **Create:** `apps/web/utils/geocoder.ts` (~100 lines)
- **Modify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (~3450, add render)

### Design
Floating search input at top of map. Autocomplete dropdown merging local parcel search + external geocoding API (Nominatim or Mapbox). Keyboard navigation. `flyTo` on selection.

### Data Flow
1. User types -> debounce 300ms
2. `searchPlaces()` called: local parcels first, then API geocoding
3. Show suggestions dropdown
4. User selects -> `mapRef.current.flyTo({ center, zoom: 16 })`
5. Optional: auto-open detail card if result is a known parcel

### Geocoding Sources
- **Local:** Reuse `canonicalizeParcelSearchText` + `parcelMatchesSearch` from `searchHelpers.ts`
- **External:** Nominatim (OSM, free, no API key) or Mapbox Geocoding (if env var set)
- **Fallback:** Local-only when external unavailable

### Component Props
```typescript
interface MapGeocoderProps {
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  parcels: MapParcel[];
  onPlaceSelect?: (place: GeocodedPlace) => void;
}
```

---

## P11: Parcel Hover Tooltip (3.5-7 hours)

### Files
- **Create:** `apps/web/components/maps/ParcelHoverTooltip.tsx` (~80 lines)
- **Modify:** `apps/web/components/maps/mapLibreAdapter.ts` (lines 23-36, 73-79)
- **Modify:** `apps/web/components/maps/MapLibreParcelMap.tsx` (lines ~1920, ~3450)

### Design
Lightweight tooltip near cursor showing parcel ID + address. `pointer-events-none`. Instant appear/disappear. Dark background, white text, text-[10px].

### Adapter Changes
```typescript
// Add to bindMapInteractionHandlers params:
onParcelHover?: (parcel: MapParcel, lngLat: [number, number]) => void;
onParcelHoverEnd?: () => void;

// Wire in handleMouseEnter:
const parcelId = event.features?.[0]?.properties?.id;
if (parcelId) {
  const parcel = params.getParcelById(parcelId);
  if (parcel) params.onParcelHover?.(parcel, [event.lngLat.lng, event.lngLat.lat]);
}

// Wire in handleMouseLeave:
params.onParcelHoverEnd?.();
```

### Positioning
- Base: `x + 10px, y + 10px` from cursor
- Bounds check: flip if would overflow viewport

---

## Implementation Order
1. **P11 (tooltip)** first — simplest, validates positioning logic reusable by P2
2. **P2 (detail card)** — reuses P11 positioning patterns
3. **P4 (geocoder)** — independent, can optionally integrate with P2

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- Manual: hover parcel -> tooltip, click parcel -> detail card, search address -> fly to location
