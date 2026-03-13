/**
 * Smoke-test property-DB–dependent endpoints to verify data from gpc-dashboard.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 pnpm exec tsx scripts/smoke_endpoints.ts
 *   BASE_URL=https://your-app.vercel.app AUTH_BEARER=<jwt> pnpm exec tsx scripts/smoke_endpoints.ts
 *
 * Env:
 *   BASE_URL               — API base (default: http://localhost:3000)
 *   AUTH_BEARER            — NextAuth session JWT or service token for protected routes (or MAP_SMOKE_AUTH_BEARER)
 *   HEALTH_TOKEN           — x-health-token for /api/health (or HEALTHCHECK_TOKEN)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
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
const SEMANTIC_SEED_PARCEL_ID =
  process.env.MAP_SMOKE_SEMANTIC_PARCEL_ID?.trim() ?? "308-4646-1";
const SEMANTIC_SEED_ADDRESS =
  process.env.MAP_SMOKE_SEMANTIC_ADDRESS?.trim() ?? "9001 CORTANA PLACE";
const SEMANTIC_SEED_PARISH =
  process.env.MAP_SMOKE_SEMANTIC_PARISH?.trim() ?? "EBR";
const SEMANTIC_SEED_ZONING =
  process.env.MAP_SMOKE_SEMANTIC_ZONING?.trim() ?? "CW3";

type Step = {
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  dataOk: boolean;
  category: "health" | "gateway" | "semantic";
  error?: string;
};

type SemanticRecallAssessment = {
  hits: unknown[];
  ok: boolean;
  error?: string;
  memoryDisabled: boolean;
};

type SmokeParcelCandidate = {
  parcelId: string;
  address: string;
  parish: string;
  zoning?: string;
  acreage?: number;
};

type StorePropertyFindingAssessment = {
  ok: boolean;
  error?: string;
};

type SemanticSmokeExecution = {
  status: number;
  ok: boolean;
  assessment: SemanticRecallAssessment;
  seeded: boolean;
  seedParcelId?: string;
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

export function extractSmokeParcels(data: unknown): SmokeParcelCandidate[] {
  const obj = toRecord(data);
  const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
  const candidates: SmokeParcelCandidate[] = [];

  for (const rawRow of arr) {
    const row = toRecord(rawRow);
    if (!row) continue;

    const parcelIdCandidate = row.propertyDbId ?? row.parcelUid ?? row.id;
    const addressCandidate = row.address;
    const parishCandidate = row.parish;
    if (
      typeof parcelIdCandidate !== "string" ||
      parcelIdCandidate.trim().length === 0 ||
      typeof addressCandidate !== "string" ||
      addressCandidate.trim().length === 0 ||
      typeof parishCandidate !== "string" ||
      parishCandidate.trim().length === 0
    ) {
      continue;
    }

    candidates.push({
      parcelId: parcelIdCandidate.trim(),
      address: addressCandidate.trim(),
      parish: parishCandidate.trim(),
      zoning:
        typeof row.zoning === "string" && row.zoning.trim().length > 0
          ? row.zoning.trim()
          : undefined,
      acreage: typeof row.acreage === "number" ? row.acreage : undefined,
    });
  }

  return candidates;
}

export function extractParcelIds(data: unknown): string[] {
  const obj = toRecord(data);
  const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
  const ids: string[] = [];

  for (const rawRow of arr) {
    const row = toRecord(rawRow);
    if (!row) continue;

    const parcelIdCandidate = row.propertyDbId ?? row.parcelUid ?? row.id;
    if (typeof parcelIdCandidate === "string" && parcelIdCandidate.trim().length > 0) {
      ids.push(parcelIdCandidate.trim());
    }
  }

  return ids;
}

export function unwrapToolExecuteResult(data: unknown): unknown {
  const envelope = toRecord(data);
  if (!envelope || !("result" in envelope)) {
    return data;
  }
  return envelope.result;
}

export function assessSemanticRecallPayload(data: unknown): SemanticRecallAssessment {
  const envelope = toRecord(data);
  if (typeof envelope?.error === "string") {
    return {
      hits: [],
      ok: false,
      error: envelope.error,
      memoryDisabled: false,
    };
  }

  const unwrapped = unwrapToolExecuteResult(data);
  if (typeof unwrapped === "string" && unwrapped.trim().length > 0) {
    return {
      hits: [],
      ok: false,
      error: unwrapped,
      memoryDisabled: false,
    };
  }

  const result = toRecord(unwrapped);
  if (!result) {
    return {
      hits: [],
      ok: false,
      error: "Semantic recall returned an unexpected payload.",
      memoryDisabled: false,
    };
  }

  if (typeof result.error === "string" && result.error.trim().length > 0) {
    return {
      hits: [],
      ok: false,
      error: result.error,
      memoryDisabled: false,
    };
  }

  const hits = Array.isArray(result.results) ? result.results : [];
  const memoryDisabled = result.memory_disabled === true;
  if (memoryDisabled) {
    return {
      hits,
      ok: false,
      error:
        typeof result.note === "string" && result.note.trim().length > 0
          ? result.note
          : "Property intelligence memory is disabled.",
      memoryDisabled: true,
    };
  }

  if (hits.length === 0) {
    return {
      hits,
      ok: false,
      error: "Qdrant returned zero semantic hits",
      memoryDisabled: false,
    };
  }

  return {
    hits,
    ok: true,
    memoryDisabled: false,
  };
}

export function assessStorePropertyFindingPayload(data: unknown): StorePropertyFindingAssessment {
  const envelope = toRecord(data);
  if (typeof envelope?.error === "string" && envelope.error.trim().length > 0) {
    return {
      ok: false,
      error: envelope.error,
    };
  }

  const unwrapped = unwrapToolExecuteResult(data);
  if (typeof unwrapped === "string" && unwrapped.trim().length > 0) {
    return {
      ok: false,
      error: unwrapped,
    };
  }

  const result = toRecord(unwrapped);
  if (!result) {
    return {
      ok: false,
      error: "Property memory seed returned an unexpected payload.",
    };
  }

  if (typeof result.error === "string" && result.error.trim().length > 0) {
    return {
      ok: false,
      error: result.error,
    };
  }

  if (result.stored === true) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "Property memory seed did not report stored=true.",
  };
}

async function verifySemanticRecall(
  seedParcel: SmokeParcelCandidate | null,
): Promise<SemanticSmokeExecution> {
  const conversationId = `smoke-${Date.now()}`;
  const initialRecall = await fetchJson("POST", "/api/agent/tools/execute", {
    toolName: "recall_property_intelligence",
    arguments: {
      query: "flood zone ebr",
      minScore: 0.4,
    },
    context: { conversationId },
    conversationId,
  });
  const initialAssessment = assessSemanticRecallPayload(initialRecall.data);
  if (initialRecall.ok && initialAssessment.ok) {
    return {
      status: initialRecall.status,
      ok: true,
      assessment: initialAssessment,
      seeded: false,
    };
  }

  const shouldSeed =
    initialRecall.ok &&
    !initialAssessment.memoryDisabled &&
    initialAssessment.error === "Qdrant returned zero semantic hits" &&
    seedParcel;

  if (!shouldSeed) {
    return {
      status: initialRecall.status,
      ok: initialRecall.ok && initialAssessment.ok,
      assessment: initialAssessment,
      seeded: false,
    };
  }

  const storeResponse = await fetchJson("POST", "/api/agent/tools/execute", {
    toolName: "store_property_finding",
    arguments: {
      parcelId: seedParcel.parcelId,
      address: seedParcel.address,
      parish: seedParcel.parish,
      zoning: seedParcel.zoning ?? null,
      acreage: seedParcel.acreage ?? null,
      dealNotes: `Production smoke semantic seed ${conversationId}`,
    },
    context: { conversationId },
    conversationId,
  });
  const storeAssessment = assessStorePropertyFindingPayload(storeResponse.data);
  if (!storeResponse.ok || !storeAssessment.ok) {
    return {
      status: storeResponse.status,
      ok: false,
      assessment: {
        hits: [],
        ok: false,
        error: storeAssessment.error ?? "Failed to seed property intelligence memory.",
        memoryDisabled: false,
      },
      seeded: true,
      seedParcelId: seedParcel.parcelId,
    };
  }

  const seededRecall = await fetchJson("POST", "/api/agent/tools/execute", {
    toolName: "recall_property_intelligence",
    arguments: {
      query: seedParcel.address,
      parish: seedParcel.parish,
      minScore: 0.0,
      topK: 5,
    },
    context: { conversationId },
    conversationId,
  });
  const seededAssessment = assessSemanticRecallPayload(seededRecall.data);
  return {
    status: seededRecall.status,
    ok: seededRecall.ok && seededAssessment.ok,
    assessment:
      seededAssessment.ok || seededAssessment.error
        ? seededAssessment
        : {
            ...seededAssessment,
            error: `Stored smoke parcel ${seedParcel.parcelId} but recall returned no hits.`,
          },
    seeded: true,
    seedParcelId: seedParcel.parcelId,
  };
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
    category: "health",
    error: healthOk
      ? undefined
      : JSON.stringify(health.data).slice(0, 180),
  });

  // 2. Deals list
  const deals = await fetchJson("GET", "/api/deals?limit=5");
  const dealsData = toRecord(deals.data);
  const dealsArr = Array.isArray(dealsData?.deals) ? dealsData.deals : [];
  const dealsOk = deals.ok && Array.isArray(dealsArr);
  steps.push({
    name: "GET /api/deals?limit=5",
    method: "GET",
    url: "/api/deals?limit=5",
    status: deals.status,
    ok: deals.ok,
    dataOk: dealsOk,
    category: "gateway",
    error:
      deals.status === 401
        ? "401 (auth required)"
        : dealsOk
          ? undefined
          : JSON.stringify(deals.data).slice(0, 180),
  });

  const dealId = (() => {
    for (const row of dealsArr as Array<Record<string, unknown>>) {
      const id = row?.id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
    return null;
  })();

  if (dealId) {
    const dealDetail = await fetchJson("GET", `/api/deals/${encodeURIComponent(dealId)}`);
    const detailOk = dealDetail.ok && toRecord(dealDetail.data)?.deal;
    steps.push({
      name: "GET /api/deals/{id}",
      method: "GET",
      url: `/api/deals/${encodeURIComponent(dealId)}`,
      status: dealDetail.status,
      ok: dealDetail.ok,
      dataOk: Boolean(detailOk),
      category: "gateway",
      error:
        dealDetail.status === 401
          ? "401 (auth required)"
          : detailOk
            ? undefined
            : JSON.stringify(dealDetail.data).slice(0, 180),
    });
  } else {
    steps.push({
      name: "GET /api/deals/{id}",
      method: "GET",
      url: "/api/deals/{id}",
      status: 0,
      ok: true,
      dataOk: true,
      category: "gateway",
      error: "Skipped: no deal id returned from /api/deals",
    });
  }

  // 3. Parcels (hasCoords)
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
    category: "gateway",
    error:
      parcels1.status === 401
        ? "401 (auth required)"
        : parcels1Ok
          ? undefined
          : JSON.stringify(parcels1.data).slice(0, 180),
  });

  // 4. Parcels (search)
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
    category: "gateway",
    error:
      parcels2.status === 401
        ? "401 (auth required)"
        : parcels2Ok
          ? undefined
          : JSON.stringify(parcels2.data).slice(0, 180),
  });

  // 5. Prospect
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
  // Prospect smoke validates polygon retrieval only. Exact-address filtering is
  // already covered by the `/api/parcels?...search=` probe above.
  const prospect = await fetchJson("POST", "/api/map/prospect", {
    polygon,
  });
  const prospectCandidates = extractSmokeParcels(prospect.data);
  const prospectOk =
    prospect.ok &&
    Array.isArray(toRecord(prospect.data)?.parcels) &&
    typeof toRecord(prospect.data)?.total === "number";
  steps.push({
    name: "POST /api/map/prospect",
    method: "POST",
    url: "/api/map/prospect",
    status: prospect.status,
    ok: prospect.ok,
    dataOk: prospectOk,
    category: "gateway",
    error:
      prospect.status === 401
        ? "401 (auth required)"
        : prospectOk
          ? undefined
          : JSON.stringify(prospect.data).slice(0, 180),
  });

  // 6. Comps (needs address or lat/lng)
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
    category: "gateway",
    error:
      comps.status === 401
        ? "401 (auth required)"
        : compsOk
          ? undefined
          : JSON.stringify(comps.data).slice(0, 180),
  });

  // 7. Parcel geometry via GET /api/parcels/{parcelId}/geometry
  const semanticSeedParcel =
    prospectCandidates[0] ?? {
      parcelId: SEMANTIC_SEED_PARCEL_ID,
      address: SEMANTIC_SEED_ADDRESS,
      parish: SEMANTIC_SEED_PARISH,
      zoning: SEMANTIC_SEED_ZONING,
    };
  const candidateId =
    extractParcelIds(parcels2.data)[0] ??
    extractParcelIds(prospect.data)[0] ??
    extractParcelIds(parcels1.data)[0] ??
    null;

  if (candidateId) {
    const geom = await fetchJson("GET", `/api/parcels/${encodeURIComponent(candidateId)}/geometry?detail_level=low`);
    const geomData = toRecord(geom.data)?.data as Record<string, unknown> | undefined;
    const geomOk =
      geom.ok &&
      geomData &&
      typeof geomData?.geom_simplified === "string" &&
      geomData.geom_simplified.length > 0;
    steps.push({
      name: `GET /api/parcels/{id}/geometry`,
      method: "GET",
      url: `/api/parcels/${encodeURIComponent(candidateId)}/geometry?detail_level=low`,
      status: geom.status,
      ok: geom.ok,
      dataOk: geomOk,
      category: "gateway",
      error: geomOk ? undefined : JSON.stringify(geom.data).slice(0, 180),
    });
  } else {
    steps.push({
      name: "GET /api/parcels/{id}/geometry",
      method: "GET",
      url: "/api/parcels/{id}/geometry",
      status: 0,
      ok: false,
      dataOk: false,
      category: "gateway",
      error: "Skipped: no parcel ID from parcels/prospect",
    });
  }

  // 8. Property intelligence semantic recall (Qdrant)
  const semanticExecution = await verifySemanticRecall(semanticSeedParcel);
  const propertyOk = semanticExecution.ok;
  steps.push({
    name: "POST /api/agent/tools/execute (recall_property_intelligence)",
    method: "POST",
    url: "/api/agent/tools/execute",
    status: semanticExecution.status,
    ok: semanticExecution.status >= 200 && semanticExecution.status < 300,
    dataOk: propertyOk,
    category: "semantic",
    error:
      semanticExecution.status === 401
        ? "401 (auth required)"
        : propertyOk
          ? undefined
          : semanticExecution.assessment.error,
  });

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

  const healthStep = steps.find((s) => s.category === "health");
  const healthPassed = healthStep?.ok && healthStep?.dataOk;
  const gatewaySteps = steps.filter((s) => s.category === "gateway");
  const semanticSteps = steps.filter((s) => s.category === "semantic");
  const gatewayOk = gatewaySteps.every((s) => s.ok && s.dataOk);
  const semanticOk = semanticSteps.every((s) => s.ok && s.dataOk);

  if (!healthPassed) {
    console.log("\n[smoke-endpoints] /api/health returned 401 — set HEALTH_TOKEN to match HEALTHCHECK_TOKEN if needed.");
  }
  if (!gatewayOk) {
    console.log("\n[smoke-endpoints] Gateway-backed Postgres endpoints failed — see errors above.");
  } else {
    console.log("\n[smoke-endpoints] Gateway-backed Postgres endpoints OK.");
  }
  if (!semanticOk) {
    console.log("[smoke-endpoints] Qdrant semantic recall failed — investigate gateway → Qdrant path.");
  } else {
    console.log("[smoke-endpoints] Qdrant semantic recall OK.");
  }
  if (semanticExecution.seeded && semanticExecution.seedParcelId) {
    console.log(
      `[smoke-endpoints] Semantic recall used seeded fallback parcel ${semanticExecution.seedParcelId}.`
    );
  }

  if (!gatewayOk || !semanticOk) {
    process.exit(1);
  }
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
