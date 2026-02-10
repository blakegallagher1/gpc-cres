# chatgpt-apps Integration

Secure integration between gallagher-cres (Next.js) and chatgpt-apps (Supabase PostGIS) for canonical GIS, zoning, and amenities data.

## Architecture

```
gallagher-cres (Next.js)                  chatgpt-apps (Supabase)
┌─────────────────────────┐               ┌──────────────────────────┐
│  Agent / Tool / UI      │               │                          │
│         │               │               │  6 RPC functions only    │
│  POST /api/external/... │──HTTP/RPC──▶  │  (external_reader role:  │
│         │               │               │   EXECUTE only, no table │
│  lib/server/client.ts   │               │   access whatsoever)     │
│  (server-only, 2 keys)  │               │                          │
└─────────────────────────┘               └──────────────────────────┘
```

### Two-Header Auth Pattern

Every request to chatgpt-apps Supabase requires **two different tokens**:

| Header | Value | Purpose |
|--------|-------|---------|
| `apikey` | Anon key | Passes Kong API gateway |
| `Authorization` | `Bearer <external_reader JWT>` | PostgREST sets DB role to `external_reader` |

Using only one token for both headers will fail:
- Restricted JWT as `apikey` → Kong rejects (401)
- Anon key as `Authorization` → role set to `anon`, not `external_reader`

## Required Environment Variables

Add to `apps/web/.env.local` (never prefix with `NEXT_PUBLIC_`):

```bash
# chatgpt-apps Supabase integration (3 required)
CHATGPT_APPS_SUPABASE_URL=https://jueyosscalcljgdorrpy.supabase.co
CHATGPT_APPS_SUPABASE_ANON_KEY=<anon key>
CHATGPT_APPS_SUPABASE_EXT_JWT=<external_reader JWT>

# Optional tuning
CHATGPT_APPS_RPC_TIMEOUT_MS=5000   # default 5000
CHATGPT_APPS_RPC_MAX_RETRIES=1     # default 1
```

Also set on Vercel for preview/production deployments.

| Env Var | What | Permissions | Expires |
|---------|------|-------------|---------|
| `CHATGPT_APPS_SUPABASE_URL` | Project REST API URL | N/A | N/A |
| `CHATGPT_APPS_SUPABASE_ANON_KEY` | Standard anon key | Subject to RLS; gateway passthrough only | 2036 |
| `CHATGPT_APPS_SUPABASE_EXT_JWT` | Custom JWT (`role: external_reader`) | Can ONLY EXECUTE 6 RPCs. Zero table access. | 2036 |

Neither key is a service role key. Worst-case compromise: read parcel geometry/zoning and read/write amenities cache. No deal data, user data, or agent runs exposed.

## API Routes

All routes are POST-only (except amenities-cache GET) and return:

### Success
```json
{ "ok": true, "request_id": "uuid", "data": { ... } }
```

### Error
```json
{ "ok": false, "request_id": "uuid", "error": { "code": "...", "message": "..." } }
```

### Endpoints

| Route | Method | Body | Description |
|-------|--------|------|-------------|
| `/api/external/chatgpt-apps/parcel-geometry` | POST | `{ parcelId, detailLevel? }` | Parcel geometry (bbox, centroid, GeoJSON) |
| `/api/external/chatgpt-apps/parcel-dimensions` | POST | `{ parcelId }` | Parcel dimensions (width, depth, frontage) |
| `/api/external/chatgpt-apps/zoning-by-parcel` | POST | `{ parcelId }` | Zoning codes for a parcel |
| `/api/external/chatgpt-apps/zoning-by-point` | POST | `{ lat, lng, parish? }` | Zoning at a lat/lng point |
| `/api/external/chatgpt-apps/amenities-cache` | GET | `?cacheKey=...` | Read cached amenities |
| `/api/external/chatgpt-apps/amenities-cache` | POST | `{ cacheKey, payload, ttlSeconds? }` | Write amenities cache |

### Detail Levels (parcel-geometry)

| Level | Max Points | Use Case |
|-------|-----------|----------|
| `low` | 100 | Map thumbnails, list views |
| `medium` | 500 | Detail views, overlays |
| `high` | 2000 | Full site analysis |

## Running Smoke Tests

The smoke test calls chatgpt-apps Supabase directly (not through API routes) to isolate the integration layer.

```bash
# Set env vars (or add to .env and source)
export CHATGPT_APPS_SUPABASE_URL=https://jueyosscalcljgdorrpy.supabase.co
export CHATGPT_APPS_SUPABASE_ANON_KEY=<anon key>
export CHATGPT_APPS_SUPABASE_EXT_JWT=<external_reader JWT>

# Optional: override test parcel
export SMOKE_TEST_PARCEL_ID=5b2cdc0a-4491-4e28-a272-2dc74e23d69c
export SMOKE_TEST_LAT=30.4515
export SMOKE_TEST_LNG=-91.1871
export SMOKE_TEST_PARISH="East Baton Rouge"

# Run
npx tsx scripts/smoke_chatgpt_apps_integration.ts
```

### 10 Test Cases

| # | Test | Validates |
|---|------|-----------|
| 1 | `rpc_get_parcel_geometry` success | Response shape: bbox, centroid, area_sqft, srid |
| 2 | `rpc_get_parcel_dimensions` success | Response shape: width_ft, depth_ft, frontage_ft, confidence |
| 3 | `rpc_zoning_lookup` success | Response shape: zoning_codes, jurisdiction, overlay |
| 4 | `rpc_zoning_lookup_by_point` success | Response shape: zoning_codes, jurisdiction |
| 5 | `rpc_get_amenities_cache` miss | Returns `{ hit: false, payload: null }` |
| 6 | Amenities round-trip | Upsert then get: verifies write + read |
| 7 | Table access denied | `GET /rest/v1/parcels` → 403 permission denied |
| 8 | Restricted JWT as apikey | Kong rejects with 401 (not a recognized key) |
| 9 | Parcel not found | Non-existent UUID → `{ "error": "Parcel not found" }` |
| 10 | Invalid coordinates | lat=999 → `{ "error": "Invalid coordinates..." }` |

## Common Failure Modes

### Missing env vars
```
Error: Missing chatgpt-apps env vars. Need: CHATGPT_APPS_SUPABASE_URL, CHATGPT_APPS_SUPABASE_ANON_KEY, CHATGPT_APPS_SUPABASE_EXT_JWT
```
**Fix:** Set all 3 vars in `.env.local`.

### Using wrong key for apikey header
```
HTTP 401 from Kong
```
**Fix:** `apikey` header must be the **anon key**, not the external_reader JWT. The JWT goes in `Authorization: Bearer`.

### RPC not deployed
```
HTTP 404 — function not found
```
**Fix:** Deploy the SQL migration in chatgpt-apps that creates the 6 RPC functions.

### Rate limited (local)
```json
{ "ok": false, "error": { "code": "RATE_LIMITED" } }
```
**Fix:** In-memory rate limiter: 10 burst, ~100/min sustained per route. Wait or restart server.

### Rate limited (upstream Supabase)
```json
{ "ok": false, "error": { "code": "UPSTREAM_ERROR", "message": "HTTP 429" } }
```
**Fix:** Reduce call frequency or upgrade the Supabase plan.

### Timeout
```
Timeout after 5000ms
```
**Fix:** Increase `CHATGPT_APPS_RPC_TIMEOUT_MS` or investigate slow queries.

### Parcel not found (application error)
```json
{ "ok": false, "error": { "code": "UPSTREAM_ERROR", "message": "Parcel not found" } }
```
**Fix:** Verify the parcel ID exists in the chatgpt-apps database.

## Security Summary

The `external_reader` role can:
- EXECUTE 6 whitelisted RPCs

It **cannot**:
- SELECT, INSERT, UPDATE, or DELETE any table
- Call internal helpers (`_resolve_parcel_id`, `_log_rpc_request`)
- Access schemas other than `public`

RPCs are `SECURITY DEFINER` — they run as the function owner, not the caller.

## Parish Data Coverage

| Parish | Parcels | Zoning Districts |
|--------|---------|-----------------|
| East Baton Rouge | ~165K | ~10K |
| Ascension | ~85K | ~58K |
| Livingston | ~95K | ~69K |
| Lafayette | ~120K | ~1K |
| St. Tammany | ~95K | ~4K |

## Verification Checklist

- [ ] `.env.local` has all 3 env vars (URL, ANON_KEY, EXT_JWT)
- [ ] `chatgptAppsClient.ts` sends `apikey` = anon key and `Authorization: Bearer` = ext JWT
- [ ] Smoke test passes all 10 test cases
- [ ] API routes return clean JSON errors, never leak raw Supabase errors
- [ ] No env var prefixed with `NEXT_PUBLIC_`
- [ ] Rate limiting active on all API routes
- [ ] Vercel env vars set for preview/production
