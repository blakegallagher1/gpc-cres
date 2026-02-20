/**
 * Smoke-test property-DB–dependent endpoints to verify data from gpc-dashboard.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 pnpm exec tsx scripts/smoke_endpoints.ts
 *   BASE_URL=https://your-app.vercel.app AUTH_BEARER=<jwt> pnpm exec tsx scripts/smoke_endpoints.ts
 *
 * Env:
 *   BASE_URL               — API base (default: http://localhost:3000)
 *   AUTH_BEARER            — Supabase JWT for protected routes (or MAP_SMOKE_AUTH_BEARER)
 *   HEALTH_TOKEN           — x-health-token for /api/health (or HEALTHCHECK_TOKEN)
 */

import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const BASE_URL = (
  process.env.BASE_URL ??
  process.env.MAP_SMOKE_BASE_URL ??
  "http://localhost:3000"
)
  .replace(/\/$/, "");
const AUTH_BEARER =
  process.env.AUTH_BEARER?.trim() ??
  process.env.MAP_SMOKE_AUTH_BEARER?.trim() ??
  "";
const HEALTH_TOKEN =
  process.env.HEALTH_TOKEN?.trim() ??
  process.env.HEALTHCHECK_TOKEN?.trim() ??
  "";
const SEARCH_ADDRESS = process.env.MAP_SMOKE_SEARCH_ADDRESS ?? "4416 HEATH DR";

type Step = {
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  dataOk: boolean;
  error?: string;
};

async function fetchJson(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_BEARER) headers["Authorization"] = `Bearer ${AUTH_BEARER}`;
  if (HEALTH_TOKEN && path.includes("/health")) {
    headers["x-health-token"] = HEALTH_TOKEN;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text().then((t) => t.slice(0, 200)) };
  }
  return { status: res.status, ok: res.ok, data };
}

function toRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function summarizeParcels(data: unknown): boolean {
  const obj = toRecord(data);
  const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
  return arr.length > 0 && typeof (arr[0] as Record<string, unknown>)?.lat === "number";
}

async function main() {
  const steps: Step[] = [];

  // 1. Health
  const health = await fetchJson("GET", "/api/health");
  const healthOk =
    health.ok &&
    (toRecord(health.data)?.status === "ok" ||
      toRecord(health.data)?.status === "degraded");
  steps.push({
    name: "GET /api/health",
    method: "GET",
    url: "/api/health",
    status: health.status,
    ok: health.ok,
    dataOk: healthOk,
    error: healthOk
      ? undefined
      : JSON.stringify(health.data).slice(0, 180),
  });

  // 2. Parcels (hasCoords)
  const parcels1 = await fetchJson("GET", "/api/parcels?hasCoords=true");
  const parcels1Ok =
    parcels1.ok && summarizeParcels(parcels1.data);
  steps.push({
    name: "GET /api/parcels?hasCoords=true",
    method: "GET",
    url: "/api/parcels?hasCoords=true",
    status: parcels1.status,
    ok: parcels1.ok,
    dataOk: parcels1Ok,
    error:
      parcels1.status === 401
        ? "401 (auth required)"
        : parcels1Ok
          ? undefined
          : JSON.stringify(parcels1.data).slice(0, 180),
  });

  // 3. Parcels (search)
  const parcels2 = await fetchJson(
    "GET",
    `/api/parcels?hasCoords=true&search=${encodeURIComponent(SEARCH_ADDRESS)}`
  );
  const parcels2Ok = parcels2.ok && summarizeParcels(parcels2.data);
  steps.push({
    name: `GET /api/parcels?search=${SEARCH_ADDRESS.slice(0, 20)}...`,
    method: "GET",
    url: "/api/parcels?hasCoords=true&search=...",
    status: parcels2.status,
    ok: parcels2.ok,
    dataOk: parcels2Ok,
    error:
      parcels2.status === 401
        ? "401 (auth required)"
        : parcels2Ok
          ? undefined
          : JSON.stringify(parcels2.data).slice(0, 180),
  });

  // 4. Prospect
  const polygon = {
    type: "Polygon" as const,
    coordinates: [
      [
        [-91.2405, 30.5001],
        [-91.2405, 30.3734],
        [-91.0701, 30.3734],
        [-91.0701, 30.5001],
        [-91.2405, 30.5001],
      ],
    ],
  };
  const prospect = await fetchJson("POST", "/api/map/prospect", {
    polygon,
    filters: { searchText: SEARCH_ADDRESS },
  });
  const prospectBody = toRecord(prospect.data);
  const prospectArr = Array.isArray(prospectBody?.parcels)
    ? prospectBody.parcels
    : [];
  const prospectOk =
    prospect.ok && prospectArr.length > 0;
  steps.push({
    name: "POST /api/map/prospect",
    method: "POST",
    url: "/api/map/prospect",
    status: prospect.status,
    ok: prospect.ok,
    dataOk: prospectOk,
    error:
      prospect.status === 401
        ? "401 (auth required)"
        : prospectOk
          ? undefined
          : JSON.stringify(prospect.data).slice(0, 180),
  });

  // 5. Comps (needs address or lat/lng)
  const comps = await fetchJson(
    "GET",
    `/api/map/comps?address=${encodeURIComponent(SEARCH_ADDRESS)}&radiusMiles=2`
  );
  const compsOk =
    comps.ok &&
    (Array.isArray(toRecord(comps.data)?.comps) ||
      toRecord(comps.data)?.comps === null);
  steps.push({
    name: "GET /api/map/comps?address=...",
    method: "GET",
    url: "/api/map/comps?address=...",
    status: comps.status,
    ok: comps.ok,
    dataOk: compsOk,
    error:
      comps.status === 401
        ? "401 (auth required)"
        : compsOk
          ? undefined
          : JSON.stringify(comps.data).slice(0, 180),
  });

  // 6. Parcel geometry (need a parcel ID from parcels search)
  const candidateId = (() => {
    for (const step of [parcels2.data, prospect.data]) {
      const obj = toRecord(step);
      const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
      for (const row of arr as Array<Record<string, unknown>>) {
        const id =
          row.propertyDbId ?? row.parcelUid ?? row.id;
        if (typeof id === "string" && id.trim().length > 0) return id.trim();
      }
    }
    return null;
  })();

  if (candidateId) {
    const geom = await fetchJson("POST", "/api/external/chatgpt-apps/parcel-geometry", {
      parcelId: candidateId,
      detailLevel: "low",
    });
    const geomData = toRecord(geom.data)?.data as Record<string, unknown> | undefined;
    const geomOk =
      geom.ok &&
      geomData &&
      typeof geomData?.geom_simplified === "string" &&
      geomData.geom_simplified.length > 0;
    steps.push({
      name: "POST /api/external/chatgpt-apps/parcel-geometry",
      method: "POST",
      url: "/api/external/chatgpt-apps/parcel-geometry",
      status: geom.status,
      ok: geom.ok,
      dataOk: geomOk,
      error: geomOk ? undefined : JSON.stringify(geom.data).slice(0, 180),
    });
  } else {
    steps.push({
      name: "POST /api/external/chatgpt-apps/parcel-geometry",
      method: "POST",
      url: "/api/external/chatgpt-apps/parcel-geometry",
      status: 0,
      ok: false,
      dataOk: false,
      error: "Skipped: no parcel ID from parcels/prospect",
    });
  }

  // Report
  console.log("\n[smoke-endpoints] BASE_URL:", BASE_URL);
  console.log("[smoke-endpoints] AUTH_BEARER:", AUTH_BEARER ? "set" : "not set");
  console.log("[smoke-endpoints] HEALTH_TOKEN:", HEALTH_TOKEN ? "set" : "not set");
  console.log("");

  for (const s of steps) {
    const badge = s.ok && s.dataOk ? "✓" : s.status === 401 ? "⚠ 401" : "✗";
    console.log(`${badge} ${s.name} status=${s.status} dataOk=${s.dataOk}`);
    if (s.error) console.log(`   ${s.error}`);
  }

  const propertyDbSteps = steps.filter(
    (s) =>
      !s.name.includes("/api/health")
  );
  const propertyDbOk = propertyDbSteps.every((s) => s.ok && s.dataOk);
  const healthStep = steps.find((s) => s.name.includes("/api/health"));
  const healthPassed = healthStep?.ok && healthStep?.dataOk;

  if (!healthPassed) {
    console.log("\n[smoke-endpoints] /api/health returned 401 — set HEALTH_TOKEN to match HEALTHCHECK_TOKEN if needed.");
  }
  if (!propertyDbOk) {
    process.exit(1);
  }
  console.log("\n[smoke-endpoints] All property-DB endpoints OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
