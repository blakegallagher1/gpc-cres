import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type SmokeStep = {
  name: string;
  status: number;
  ok: boolean;
  count: number;
  sampleKeys: string[];
  error?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[map-smoke] Missing required env ${name}.`);
  return value;
}

function readEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function summarizeArray(value: unknown): { count: number; sampleKeys: string[] } {
  if (!Array.isArray(value)) return { count: 0, sampleKeys: [] };
  const first = toRecord(value[0]);
  return { count: value.length, sampleKeys: first ? Object.keys(first).slice(0, 8) : [] };
}

async function callJson(
  baseUrl: string,
  token: string,
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; payload: unknown }> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { nonJsonBody: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, payload };
}

async function main() {
  const baseUrl = requireEnv("MAP_SMOKE_BASE_URL").replace(/\/$/, "");
  const bearerToken = requireEnv("MAP_SMOKE_AUTH_BEARER");
  const searchAddress = readEnv("MAP_SMOKE_SEARCH_ADDRESS", "4416 HEATH DR");
  const reportDir = readEnv("MAP_SMOKE_REPORT_DIR", "output/parcel-smoke");

  const polygon = {
    type: "Polygon",
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

  const steps: SmokeStep[] = [];

  const parcelsHasCoords = await callJson(
    baseUrl,
    bearerToken,
    "GET",
    "/api/parcels?hasCoords=true",
  );
  const parcelsHasCoordsBody = toRecord(parcelsHasCoords.payload);
  const parcelsHasCoordsSummary = summarizeArray(parcelsHasCoordsBody?.parcels);
  steps.push({
    name: "GET /api/parcels?hasCoords=true",
    status: parcelsHasCoords.status,
    ok: parcelsHasCoords.ok,
    count: parcelsHasCoordsSummary.count,
    sampleKeys: parcelsHasCoordsSummary.sampleKeys,
    error: parcelsHasCoords.ok ? undefined : JSON.stringify(parcelsHasCoords.payload).slice(0, 220),
  });

  const parcelsSearch = await callJson(
    baseUrl,
    bearerToken,
    "GET",
    `/api/parcels?search=${encodeURIComponent(searchAddress)}`,
  );
  const parcelsSearchBody = toRecord(parcelsSearch.payload);
  const parcelsSearchSummary = summarizeArray(parcelsSearchBody?.parcels);
  steps.push({
    name: "GET /api/parcels?search=<known-address>",
    status: parcelsSearch.status,
    ok: parcelsSearch.ok,
    count: parcelsSearchSummary.count,
    sampleKeys: parcelsSearchSummary.sampleKeys,
    error: parcelsSearch.ok ? undefined : JSON.stringify(parcelsSearch.payload).slice(0, 220),
  });

  const prospect = await callJson(
    baseUrl,
    bearerToken,
    "POST",
    "/api/map/prospect",
    {
      polygon,
      filters: {
        searchText: searchAddress,
      },
    },
  );
  const prospectBody = toRecord(prospect.payload);
  const prospectSummary = summarizeArray(prospectBody?.parcels);
  steps.push({
    name: "POST /api/map/prospect",
    status: prospect.status,
    ok: prospect.ok,
    count: prospectSummary.count,
    sampleKeys: prospectSummary.sampleKeys,
    error: prospect.ok ? undefined : JSON.stringify(prospect.payload).slice(0, 220),
  });

  const candidateParcelId = (() => {
    const prospectRows = Array.isArray(prospectBody?.parcels) ? prospectBody?.parcels : [];
    for (const row of prospectRows as Array<Record<string, unknown>>) {
      const id = row.propertyDbId ?? row.parcelUid ?? row.id;
      if (typeof id === "string" && id.trim().length > 0) return id.trim();
    }
    const searchRows = Array.isArray(parcelsSearchBody?.parcels) ? parcelsSearchBody.parcels : [];
    for (const row of searchRows as Array<Record<string, unknown>>) {
      const id = row.propertyDbId ?? row.parcelUid ?? row.id;
      if (typeof id === "string" && id.trim().length > 0) return id.trim();
    }
    return "";
  })();

  const parcelGeometry = candidateParcelId
    ? await callJson(
        baseUrl,
        bearerToken,
        "POST",
        "/api/external/chatgpt-apps/parcel-geometry",
        {
          parcelId: candidateParcelId,
          detailLevel: "low",
        },
      )
    : { status: 400, ok: false, payload: { error: "No parcel candidate from prior steps." } };
  const parcelGeometryBody = toRecord(parcelGeometry.payload);
  const geometryData = toRecord(parcelGeometryBody?.data);
  const hasGeometry = typeof geometryData?.geom_simplified === "string" && geometryData.geom_simplified.length > 0;
  steps.push({
    name: "POST /api/external/chatgpt-apps/parcel-geometry",
    status: parcelGeometry.status,
    ok: parcelGeometry.ok && hasGeometry,
    count: hasGeometry ? 1 : 0,
    sampleKeys: geometryData ? Object.keys(geometryData).slice(0, 8) : [],
    error:
      parcelGeometry.ok && hasGeometry
        ? undefined
        : JSON.stringify(parcelGeometry.payload).slice(0, 220),
  });

  const success = steps.every((step) => step.ok && step.count > 0);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    searchAddress,
    candidateParcelId,
    success,
    steps,
  };

  await mkdir(path.resolve(process.cwd(), reportDir), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(process.cwd(), reportDir, `map-smoke-${stamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[map-smoke] report=${reportPath}`);
  for (const step of steps) {
    console.log(`[map-smoke] ${step.name} status=${step.status} count=${step.count} ok=${step.ok}`);
  }

  if (!success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[map-smoke] fatal:", error);
  process.exit(1);
});
