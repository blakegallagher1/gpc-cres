# Legacy chatgpt-apps Parcel Geometry Route — Removed

**Status:** Removed on 2026-03-05.

The legacy `POST /api/external/chatgpt-apps/parcel-geometry` route and its smoke script were retired.

Parcel geometry now flows through the authenticated app route:

- `GET /api/parcels/[parcelId]/geometry?detail_level=low`

That route:

- enforces normal app auth before any upstream call
- applies the shared route rate limiter
- proxies to `${LOCAL_API_URL}/api/parcels/{parcelId}/geometry`
- authenticates upstream with `LOCAL_API_KEY`
- forwards optional Cloudflare Access headers from `getCloudflareAccessHeadersFromEnv()`
- falls back to synthetic dev geometry only when the local dev fallback is enabled

Operational smoke checks for the current geometry path:

- `GET /api/parcels?hasCoords=true`
- `GET /api/parcels?hasCoords=true&search=<address>`
- `GET /api/parcels/{parcelId}/geometry?detail_level=low`

Reference files:

- `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
- `apps/web/app/api/parcels/[parcelId]/geometry/route.test.ts`
- `scripts/parcels/smoke_map_parcel_prod.ts`
- `scripts/smoke_endpoints.ts`

No `chatgpt-apps` parcel geometry env vars or Supabase RPC dependencies remain on the active parcel geometry path.
