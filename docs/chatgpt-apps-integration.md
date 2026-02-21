# chatgpt-apps Integration — REMOVED

**Status:** Deprecated. Removed 2026-02.

Parcel geometry is now served directly from Supabase (gpc-dashboard) via `propertyDbRpc`. No chatgpt-apps env vars or integration required.

- `POST /api/external/chatgpt-apps/parcel-geometry` — uses `api_get_parcel`, `api_search_parcels`, `rpc_get_parcel_geometry` (Supabase RPCs in gpc-dashboard)
- See `infra/sql/property-parcels-and-geometry-rpc.sql` for RPC definitions
