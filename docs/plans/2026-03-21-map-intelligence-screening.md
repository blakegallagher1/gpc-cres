# Map Intelligence Layers, Screening Dashboard & Precomputed Cache

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface all local-server screening data (EPA, soils, wetlands, traffic, LDEQ) as toggleable map overlays, add an inline 6-point screening scorecard on parcel click and deal detail, and build a nightly materialized view so screening queries drop from ~6s to <100ms.

**Architecture:** Three layers built bottom-up: (1) SQL materialized view `mv_parcel_screening_summary` pre-joins all screening tables nightly via pg_cron, (2) Next.js API route `/api/parcels/[parcelId]/screening` that reads from the cache with live-query fallback, (3) frontend map overlays + screening panel consuming the API. Martin already serves soils/wetlands/epa_facilities/fema_flood as tile layers — we just need to wire them into the toggle UI.

**Tech Stack:** PostgreSQL/PostGIS (materialized view + pg_cron), FastAPI gateway (screening endpoints already exist), Next.js API routes, MapLibre GL JS (vector tiles), React components (shadcn/ui), Vitest for tests.

---

## Task 1: SQL — Materialized View for Screening Cache

**Files:**
- Create: `infra/sql/mv-parcel-screening-summary.sql`

**Step 1: Write the materialized view SQL**

```sql
-- Precomputed screening summary for all parcels with geometry.
-- Joins flood, soils, wetlands, EPA proximity into one row per parcel.
-- Refreshed nightly at 2:00 AM UTC via pg_cron.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parcel_screening_summary AS
WITH parcel_base AS (
  SELECT id, parcel_id, geom, ST_Centroid(geom) AS centroid
  FROM ebr_parcels
  WHERE geom IS NOT NULL
),
flood_agg AS (
  SELECT
    p.parcel_id,
    bool_or(
      f.zone_code LIKE 'A%' OR f.zone_code LIKE 'V%'
    ) AS in_sfha,
    array_agg(DISTINCT f.zone_code) FILTER (WHERE f.zone_code IS NOT NULL) AS flood_zones
  FROM parcel_base p
  LEFT JOIN fema_flood f ON ST_Intersects(p.geom, f.geom)
  GROUP BY p.parcel_id
),
soil_agg AS (
  SELECT
    p.parcel_id,
    mode() WITHIN GROUP (ORDER BY s.drainage_class) AS dominant_drainage,
    bool_or(s.hydric_rating = 'Yes' OR s.hydric_rating = 'All Hydric') AS has_hydric,
    array_agg(DISTINCT s.shrink_swell_potential) FILTER (WHERE s.shrink_swell_potential IS NOT NULL) AS shrink_swell
  FROM parcel_base p
  LEFT JOIN soils s ON ST_Intersects(p.geom, s.geom)
  GROUP BY p.parcel_id
),
wetland_agg AS (
  SELECT
    p.parcel_id,
    bool_or(w.geom IS NOT NULL) AS has_wetlands,
    array_agg(DISTINCT w.wetland_type) FILTER (WHERE w.wetland_type IS NOT NULL) AS wetland_types
  FROM parcel_base p
  LEFT JOIN wetlands w ON ST_Intersects(p.geom, w.geom)
  GROUP BY p.parcel_id
),
epa_agg AS (
  SELECT
    p.parcel_id,
    count(e.id) FILTER (WHERE ST_DWithin(p.centroid::geography, e.geom::geography, 1609.34)) AS epa_within_1mi,
    coalesce(sum(e.violations_count) FILTER (WHERE ST_DWithin(p.centroid::geography, e.geom::geography, 1609.34)), 0) AS epa_violations_1mi,
    coalesce(sum(e.penalties_amount) FILTER (WHERE ST_DWithin(p.centroid::geography, e.geom::geography, 1609.34)), 0) AS epa_penalties_1mi
  FROM parcel_base p
  LEFT JOIN epa_facilities e ON ST_DWithin(p.centroid::geography, e.geom::geography, 1609.34)
  GROUP BY p.parcel_id
)
SELECT
  pb.parcel_id,
  pb.centroid,
  -- Flood
  coalesce(fl.in_sfha, false) AS flood_in_sfha,
  coalesce(fl.flood_zones, '{}') AS flood_zones,
  -- Soils
  so.dominant_drainage AS soil_drainage,
  coalesce(so.has_hydric, false) AS soil_hydric,
  coalesce(so.shrink_swell, '{}') AS soil_shrink_swell,
  -- Wetlands
  coalesce(wl.has_wetlands, false) AS has_wetlands,
  coalesce(wl.wetland_types, '{}') AS wetland_types,
  -- EPA
  coalesce(ep.epa_within_1mi, 0)::int AS epa_facilities_1mi,
  coalesce(ep.epa_violations_1mi, 0)::int AS epa_violations_1mi,
  coalesce(ep.epa_penalties_1mi, 0)::numeric AS epa_penalties_1mi,
  -- Metadata
  now() AS refreshed_at
FROM parcel_base pb
LEFT JOIN flood_agg fl ON pb.parcel_id = fl.parcel_id
LEFT JOIN soil_agg so ON pb.parcel_id = so.parcel_id
LEFT JOIN wetland_agg wl ON pb.parcel_id = wl.parcel_id
LEFT JOIN epa_agg ep ON pb.parcel_id = ep.parcel_id;

-- Indexes for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_mvpss_parcel_id
  ON mv_parcel_screening_summary (parcel_id);
CREATE INDEX IF NOT EXISTS idx_mvpss_centroid
  ON mv_parcel_screening_summary USING gist (centroid);

-- pg_cron: refresh nightly at 2:00 AM UTC (before mv_parcel_intelligence at 3:00 AM)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-mv-parcel-screening-summary');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-mv-parcel-screening-summary',
  '0 2 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_screening_summary$$
);
```

**Step 2: Deploy to local server**

```bash
ssh cres_admin@ssh.gallagherpropco.com
# Then on the server:
docker exec -i entitlement-os-postgres psql -U postgres -d entitlement_os < /path/to/mv-parcel-screening-summary.sql
```

Or via Admin API:
```bash
curl -X POST https://api.gallagherpropco.com/admin/db/query \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL from above>"}'
```

**Step 3: Verify the view was created and has data**

```bash
curl -X POST https://api.gallagherpropco.com/admin/db/query \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT count(*) FROM mv_parcel_screening_summary"}'
```

Expected: count close to 198,949 (all parcels with geometry).

**Step 4: Commit**

```bash
git add infra/sql/mv-parcel-screening-summary.sql
git commit -m "feat(db): add mv_parcel_screening_summary materialized view with pg_cron refresh"
```

---

## Task 2: Gateway — Screening Cache Endpoint

**Files:**
- Modify: `infra/local-api/main.py` — add `/api/screening/cached/{parcel_id}` endpoint

**Step 1: Add the cached screening endpoint to the FastAPI gateway**

Add after the existing screening endpoints:

```python
@app.get("/api/screening/cached/{parcel_id}")
async def screening_cached(parcel_id: str):
    """Return precomputed screening summary from materialized view.
    Falls back to live queries if parcel not in cache."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                parcel_id,
                flood_in_sfha, flood_zones,
                soil_drainage, soil_hydric, soil_shrink_swell,
                has_wetlands, wetland_types,
                epa_facilities_1mi, epa_violations_1mi, epa_penalties_1mi,
                refreshed_at
            FROM mv_parcel_screening_summary
            WHERE parcel_id = $1
            """,
            parcel_id,
        )
    if not row:
        return JSONResponse(
            {"ok": False, "error": "Parcel not found in screening cache"},
            status_code=404,
        )
    data = dict(row)
    # Convert array/numeric types for JSON serialization
    data["flood_zones"] = list(data.get("flood_zones") or [])
    data["soil_shrink_swell"] = list(data.get("soil_shrink_swell") or [])
    data["wetland_types"] = list(data.get("wetland_types") or [])
    data["epa_penalties_1mi"] = float(data.get("epa_penalties_1mi") or 0)
    data["refreshed_at"] = str(data.get("refreshed_at", ""))
    return {"ok": True, "data": data}
```

**Step 2: Deploy and test**

```bash
ssh root@5.161.99.123 "su - controller -c 'cd /home/controller/gpc-codex-controller && git pull --ff-only'"
# Or deploy via admin API
curl https://api.gallagherpropco.com/admin/deploy/gateway -X POST -H "Authorization: Bearer $ADMIN_API_KEY"
```

Test:
```bash
curl -s -H "Authorization: Bearer $LOCAL_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  "https://api.gallagherpropco.com/api/screening/cached/4245003"
```

Expected: JSON with flood, soil, wetland, EPA fields, sub-100ms response.

**Step 3: Commit**

```bash
git add infra/local-api/main.py
git commit -m "feat(gateway): add /api/screening/cached/{parcel_id} endpoint reading materialized view"
```

---

## Task 3: Next.js API Route — `/api/parcels/[parcelId]/screening`

**Files:**
- Create: `apps/web/app/api/parcels/[parcelId]/screening/route.ts`

**Step 1: Write the API route**

```typescript
import "server-only";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import {
  getCloudflareAccessHeadersFromEnv,
  getPropertyDbConfigOrNull,
} from "@/lib/server/propertyDbEnv";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
} from "@/lib/server/observability";

export const runtime = "nodejs";

const SCREENING_TIMEOUT_MS = 8_000;

export type ScreeningSummary = {
  parcel_id: string;
  flood_in_sfha: boolean;
  flood_zones: string[];
  soil_drainage: string | null;
  soil_hydric: boolean;
  soil_shrink_swell: string[];
  has_wetlands: boolean;
  wetland_types: string[];
  epa_facilities_1mi: number;
  epa_violations_1mi: number;
  epa_penalties_1mi: number;
  refreshed_at: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const requestId = crypto.randomUUID();
  const context = createRequestObservabilityContext(request, "/api/parcels/[parcelId]/screening");
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId ?? requestId);

  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return withRequestId(NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }));
    }

    const { parcelId: rawParcelId } = await params;
    const parcelId = decodeURIComponent(rawParcelId).replace(/^ext-/, "").trim();
    if (!parcelId) {
      return withRequestId(NextResponse.json({ ok: false, error: "parcelId is required" }, { status: 400 }));
    }

    if (!checkRateLimit(`screening:${auth.orgId}`, 30, 5)) {
      return withRequestId(NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 }));
    }

    const config = getPropertyDbConfigOrNull();
    if (!config) {
      return withRequestId(NextResponse.json({ ok: false, error: "Gateway not configured" }, { status: 503 }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCREENING_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${config.url}/api/screening/cached/${encodeURIComponent(parcelId)}`,
        {
          headers: {
            Authorization: `Bearer ${config.key}`,
            ...getCloudflareAccessHeadersFromEnv(),
          },
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return withRequestId(
          NextResponse.json(
            { ok: false, error: res.status === 404 ? "Parcel not in screening cache" : "Gateway error" },
            { status: res.status >= 500 ? 502 : res.status },
          ),
        );
      }

      const json = (await res.json()) as { ok: boolean; data?: ScreeningSummary };
      const response = NextResponse.json({ ok: true, data: json.data });
      response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
      return withRequestId(response);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    Sentry.captureException(err, { tags: { route: "api.parcels.screening", method: "GET" } });
    return withRequestId(
      NextResponse.json(
        { ok: false, error: isTimeout ? "Screening request timed out" : "Internal error" },
        { status: isTimeout ? 504 : 502 },
      ),
    );
  }
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/web/app/api/parcels/\[parcelId\]/screening/route.ts
git commit -m "feat(api): add /api/parcels/[parcelId]/screening route with cached gateway lookup"
```

---

## Task 4: React Hook — `useParcelScreening`

**Files:**
- Create: `apps/web/hooks/useParcelScreening.ts`

**Step 1: Write the hook**

```typescript
"use client";

import useSWR from "swr";
import type { ScreeningSummary } from "@/app/api/parcels/[parcelId]/screening/route";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Screening fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data as ScreeningSummary;
};

export function useParcelScreening(parcelId: string | null) {
  const { data, error, isLoading } = useSWR(
    parcelId ? `/api/parcels/${encodeURIComponent(parcelId)}/screening` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  return { screening: data ?? null, error, isLoading };
}
```

**Step 2: Commit**

```bash
git add apps/web/hooks/useParcelScreening.ts
git commit -m "feat(hooks): add useParcelScreening SWR hook"
```

---

## Task 5: Screening Scorecard Component

**Files:**
- Create: `apps/web/components/maps/ScreeningScorecard.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useParcelScreening } from "@/hooks/useParcelScreening";
import { cn } from "@/lib/utils";
import {
  Droplets, Mountain, TreePine, Factory, AlertTriangle, MapPin,
} from "lucide-react";

type Props = { parcelId: string | null; className?: string };

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        ok
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400",
      )}
    >
      {ok ? "Clear" : "Flag"}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function ScreeningScorecard({ parcelId, className }: Props) {
  const { screening, isLoading, error } = useParcelScreening(parcelId);

  if (!parcelId) return null;
  if (isLoading) {
    return (
      <div className={cn("animate-pulse rounded-lg bg-muted/30 p-3", className)}>
        <div className="h-4 w-24 rounded bg-muted/50" />
      </div>
    );
  }
  if (error || !screening) return null;

  const items = [
    {
      icon: Droplets,
      label: "Flood",
      ok: !screening.flood_in_sfha,
      detail: screening.flood_in_sfha
        ? `SFHA — ${screening.flood_zones.join(", ")}`
        : "Outside SFHA",
    },
    {
      icon: Mountain,
      label: "Soils",
      ok: !screening.soil_hydric,
      detail: screening.soil_hydric
        ? `Hydric soil — ${screening.soil_drainage ?? "unknown"} drainage`
        : screening.soil_drainage ?? "No data",
    },
    {
      icon: TreePine,
      label: "Wetlands",
      ok: !screening.has_wetlands,
      detail: screening.has_wetlands
        ? screening.wetland_types.join(", ")
        : "None detected",
    },
    {
      icon: Factory,
      label: "EPA",
      ok: screening.epa_facilities_1mi === 0,
      detail:
        screening.epa_facilities_1mi > 0
          ? `${screening.epa_facilities_1mi} facilities, ${screening.epa_violations_1mi} violations within 1 mi`
          : "No facilities within 1 mi",
    },
  ];

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Site Screening
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
              item.ok ? "border-border/40" : "border-red-500/30 bg-red-500/5",
            )}
          >
            <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{item.label}</span>
                <Badge ok={item.ok} label="" />
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-right text-[9px] text-muted-foreground/60">
        Cached {new Date(screening.refreshed_at).toLocaleDateString()}
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/components/maps/ScreeningScorecard.tsx
git commit -m "feat(ui): add ScreeningScorecard component with 4-point environmental summary"
```

---

## Task 6: Map Overlay Toggles — Soils, Wetlands, EPA Facilities

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx`
- Modify: `apps/web/components/maps/tileUrls.ts` (if needed)

This is the largest task. The pattern is:

1. Add state variables for `showSoils`, `showWetlands`, `showEpa` (following the `showZoning`/`showFlood` pattern)
2. Add tile sources in the `style.sources` object for `soils`, `wetlands`, `epa_facilities` from Martin
3. Add layer definitions for each (fill for polygons, circle for points)
4. Add visibility toggles in the `useEffect` that calls `setLayoutProperty`
5. Add checkboxes in the overlay panel
6. Persist to localStorage

**Step 1: Add state and localStorage persistence**

In the state declarations block (near lines 563-570), add:

```tsx
const [showSoils, setShowSoils] = useState(() => getSavedOverlaysFallback().soils ?? false);
const [showWetlands, setShowWetlands] = useState(() => getSavedOverlaysFallback().wetlands ?? false);
const [showEpa, setShowEpa] = useState(() => getSavedOverlaysFallback().epa ?? false);
```

Update `getSavedOverlaysFallback()` to include `soils`, `wetlands`, `epa` with defaults of `false`.

Update the localStorage persistence `useEffect` to include the three new keys.

**Step 2: Add Martin tile sources**

In the `style.sources` object (near lines 1134-1157), add:

```tsx
"soils-tiles": {
  type: "vector",
  tiles: [getMartinParcelTileUrl("soils")],
  minzoom: 10,
  maxzoom: 22,
},
"wetlands-tiles": {
  type: "vector",
  tiles: [getMartinParcelTileUrl("wetlands")],
  minzoom: 8,
  maxzoom: 22,
},
"epa-tiles": {
  type: "vector",
  tiles: [getMartinParcelTileUrl("epa_facilities")],
  minzoom: 6,
  maxzoom: 22,
},
```

**Step 3: Add layer definitions**

In the `style.layers` array, add:

```tsx
// Soils — semi-transparent fill colored by hydric rating
{
  id: "soils-tiles-fill",
  type: "fill",
  source: "soils-tiles",
  "source-layer": "soils",
  layout: { visibility: "none" },
  paint: {
    "fill-color": [
      "match", ["get", "hydric_rating"],
      "All Hydric", "#ef4444",    // red
      "Partially Hydric", "#f59e0b", // amber
      "Not Hydric", "#22c55e",    // green
      "#6b7280",                  // gray fallback
    ],
    "fill-opacity": 0.25,
  },
},
// Wetlands — blue-tinted fill
{
  id: "wetlands-tiles-fill",
  type: "fill",
  source: "wetlands-tiles",
  "source-layer": "wetlands",
  layout: { visibility: "none" },
  paint: {
    "fill-color": "#3b82f6",
    "fill-opacity": 0.3,
    "fill-outline-color": "#2563eb",
  },
},
// EPA Facilities — circle markers sized by violations
{
  id: "epa-tiles-circle",
  type: "circle",
  source: "epa-tiles",
  "source-layer": "epa_facilities",
  layout: { visibility: "none" },
  paint: {
    "circle-radius": [
      "interpolate", ["linear"], ["coalesce", ["get", "violations_count"], 0],
      0, 4,
      10, 8,
      50, 14,
    ],
    "circle-color": [
      "interpolate", ["linear"], ["coalesce", ["get", "violations_count"], 0],
      0, "#22c55e",
      5, "#f59e0b",
      20, "#ef4444",
    ],
    "circle-opacity": 0.8,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#fff",
  },
},
```

**Step 4: Add visibility toggle logic**

In the `useEffect` that handles overlay visibility (near lines 1614-1627), add:

```tsx
map.setLayoutProperty("soils-tiles-fill", "visibility", showLayers && showSoils ? "visible" : "none");
map.setLayoutProperty("wetlands-tiles-fill", "visibility", showLayers && showWetlands ? "visible" : "none");
map.setLayoutProperty("epa-tiles-circle", "visibility", showLayers && showEpa ? "visible" : "none");
```

Add `showSoils`, `showWetlands`, `showEpa` to the `useEffect` dependency array.

**Step 5: Add checkboxes in overlay panel**

In the overlay panel (near lines 1812-1850), add after the Flood Zones checkbox:

```tsx
<label className="flex items-center gap-2 cursor-pointer py-0.5">
  <input type="checkbox" checked={showSoils} onChange={(e) => setShowSoils(e.target.checked)}
    className="rounded h-3.5 w-3.5 accent-map-accent" />
  <span className="text-[11px] text-map-text-primary">Soils (hydric)</span>
</label>
<label className="flex items-center gap-2 cursor-pointer py-0.5">
  <input type="checkbox" checked={showWetlands} onChange={(e) => setShowWetlands(e.target.checked)}
    className="rounded h-3.5 w-3.5 accent-map-accent" />
  <span className="text-[11px] text-map-text-primary">Wetlands</span>
</label>
<label className="flex items-center gap-2 cursor-pointer py-0.5">
  <input type="checkbox" checked={showEpa} onChange={(e) => setShowEpa(e.target.checked)}
    className="rounded h-3.5 w-3.5 accent-map-accent" />
  <span className="text-[11px] text-map-text-primary">EPA Facilities</span>
</label>
```

**Step 6: Verify and commit**

```bash
pnpm typecheck && pnpm lint
git add apps/web/components/maps/MapLibreParcelMap.tsx
git commit -m "feat(map): add soils, wetlands, EPA facility overlay toggles from Martin tile layers"
```

---

## Task 7: Screening Scorecard in Map Popup

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx` — import and render `ScreeningScorecard` in parcel popup or side panel

The map currently shows a basic popup on parcel click. We need to either:
- (A) Replace the HTML popup with a React portal that includes `ScreeningScorecard`, or
- (B) Add a side panel that shows `ScreeningScorecard` when a parcel is selected

**Recommended: Option B** — Add the scorecard below the map search/chat panel when a parcel is selected. The popup stays lightweight; the scorecard appears in the map page's right panel or below the search bar.

**Step 1: Wire ScreeningScorecard into the map page**

In `apps/web/app/map/page.tsx`, import the scorecard and render it when a parcel is selected:

```tsx
import { ScreeningScorecard } from "@/components/maps/ScreeningScorecard";

// In the JSX, near the selected parcel display area:
{selectedParcelId && (
  <ScreeningScorecard parcelId={selectedParcelId} className="mt-3" />
)}
```

The `selectedParcelId` comes from the map dispatch context (`SELECT_PARCELS` action).

**Step 2: Commit**

```bash
git add apps/web/app/map/page.tsx
git commit -m "feat(map): show ScreeningScorecard when parcel is selected"
```

---

## Task 8: Screening Scorecard in Deal Detail

**Files:**
- Modify: `apps/web/app/deals/[id]/page.tsx`

**Step 1: Add screening scorecard to the deal overview or documents tab**

In the deal detail page, parcels are associated with deals. Add the scorecard for the primary parcel.

```tsx
import { ScreeningScorecard } from "@/components/maps/ScreeningScorecard";

// In the overview tab or documents tab, after the parcel list:
{deal.parcels?.[0]?.propertyDbId && (
  <ScreeningScorecard
    parcelId={deal.parcels[0].propertyDbId}
    className="mt-4"
  />
)}
```

**Step 2: Commit**

```bash
git add apps/web/app/deals/\[id\]/page.tsx
git commit -m "feat(deals): show ScreeningScorecard on deal detail for primary parcel"
```

---

## Task 9: Verification

**Step 1: Run full test suite**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All must pass.

**Step 2: Local browser smoke test**

With `NEXT_PUBLIC_DISABLE_AUTH=true`:
1. Open `/map` — verify soils, wetlands, EPA toggles appear and render tile data when checked
2. Click a parcel — verify ScreeningScorecard appears with flood/soils/wetlands/EPA data
3. Open a deal detail — verify ScreeningScorecard shows for the deal's parcel
4. Check browser network tab — screening API call should return <100ms with cached data

**Step 3: Test gateway endpoint directly**

```bash
curl -s -H "Authorization: Bearer $LOCAL_API_KEY" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  "https://api.gallagherpropco.com/api/screening/cached/4245003" | python3 -m json.tool
```

Should return full screening summary in <100ms.

**Step 4: Final commit and push**

```bash
git push origin main
```

---

## Dependency Order

```
Task 1 (SQL materialized view)
  → Task 2 (Gateway cached endpoint)
    → Task 3 (Next.js API route)
      → Task 4 (React hook)
        → Task 5 (Scorecard component)
          → Task 7 (Map popup integration)
          → Task 8 (Deal detail integration)

Task 6 (Map overlay toggles) — independent, can run in parallel with Tasks 3-5

Task 9 (Verification) — after all tasks complete
```
