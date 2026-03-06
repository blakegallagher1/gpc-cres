/**
 * Production observability monitor.
 *
 * Usage:
 *   BASE_URL=https://gallagherpropco.com \
 *   AUTH_BEARER=<jwt> \
 *   HEALTH_TOKEN=<health-token> \
 *   OBS_SESSION_COOKIE="__Secure-next-auth.session-token=..." \
 *   pnpm exec tsx scripts/observability/monitor_production.ts
 *
 * Output:
 *   output/observability/monitor-<timestamp>.json
 *   output/observability/monitor-<timestamp>.log
 */

import path from "node:path";
import fs from "node:fs/promises";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const BASE_URL = (
  process.env.BASE_URL ??
  process.env.OBS_BASE_URL ??
  process.env.MAP_SMOKE_BASE_URL ??
  "https://gallagherpropco.com"
).replace(/\/$/, "");

const AUTH_BEARER =
  process.env.OBS_AUTH_BEARER?.trim() ??
  process.env.AUTH_BEARER?.trim() ??
  process.env.MAP_SMOKE_AUTH_BEARER?.trim() ??
  "";

const HEALTH_TOKEN =
  process.env.OBS_HEALTH_TOKEN?.trim() ??
  process.env.HEALTH_TOKEN?.trim() ??
  process.env.HEALTHCHECK_TOKEN?.trim() ??
  "";

const SESSION_COOKIE =
  process.env.OBS_SESSION_COOKIE?.trim() ??
  process.env.SESSION_COOKIE?.trim() ??
  process.env.AUTH_COOKIE?.trim() ??
  "";

const SEARCH_ADDRESS =
  process.env.OBS_SEARCH_ADDRESS ??
  process.env.MAP_SMOKE_SEARCH_ADDRESS ??
  "4416 HEATH DR";

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OBS_OUTPUT_DIR ?? "output/observability",
);

const ALLOW_PARTIAL = (process.env.OBS_ALLOW_PARTIAL ?? "").toLowerCase() === "true";
const EMIT_TELEMETRY = (process.env.OBS_EMIT_TELEMETRY ?? "true").toLowerCase() !== "false";

const OBS_ENDPOINT = "/api/observability/events";

type StepCategory = "page" | "api" | "telemetry";

type StepResult = {
  name: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  dataOk: boolean;
  category: StepCategory;
  requestId?: string | null;
  warning?: string;
  error?: string;
  skipped?: boolean;
};

type FetchJsonResult = {
  status: number;
  ok: boolean;
  data: unknown;
  headers: Headers;
};

function formatTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[:.]/g, "")
    .replace("T", "-")
    .replace("Z", "Z");
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractRequestId(headers: Headers): string | null {
  return (
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    headers.get("x-trace-id") ??
    null
  );
}

async function fetchJson(
  method: "GET" | "POST",
  pathSuffix: string,
  body?: unknown,
): Promise<FetchJsonResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_BEARER) headers["Authorization"] = `Bearer ${AUTH_BEARER}`;
  if (HEALTH_TOKEN && pathSuffix.includes("/health")) {
    headers["x-health-token"] = HEALTH_TOKEN;
  }

  const res = await fetch(`${BASE_URL}${pathSuffix}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    const text = await res.text();
    data = { raw: text.slice(0, 200) };
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function fetchPage(pathSuffix: string): Promise<{ status: number; ok: boolean; location: string | null }> {
  const headers: Record<string, string> = {};
  if (SESSION_COOKIE) headers["Cookie"] = SESSION_COOKIE;

  const res = await fetch(`${BASE_URL}${pathSuffix}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  return {
    status: res.status,
    ok: res.ok,
    location: res.headers.get("location"),
  };
}

function summarizeParcels(data: unknown): boolean {
  const obj = toRecord(data);
  const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
  return arr.length > 0 && typeof (arr[0] as Record<string, unknown>)?.lat === "number";
}

function addStep(lines: string[], steps: StepResult[], step: StepResult) {
  steps.push(step);
  let badge = "✓";
  if (step.skipped) badge = "↷";
  else if (!step.ok || !step.dataOk) badge = "✗";
  else if (step.warning) badge = "⚠";

  lines.push(
    `${badge} ${step.name} status=${step.status} dataOk=${step.dataOk}${step.requestId ? ` reqId=${step.requestId}` : ""}`,
  );
  if (step.warning) lines.push(`   warn: ${step.warning}`);
  if (step.error) lines.push(`   error: ${step.error}`);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const now = new Date();
  const stamp = formatTimestamp(now);

  const steps: StepResult[] = [];
  const lines: string[] = [];

  lines.push(`[observability-monitor] base=${BASE_URL}`);
  lines.push(`[observability-monitor] authBearer=${AUTH_BEARER ? "set" : "missing"}`);
  lines.push(`[observability-monitor] healthToken=${HEALTH_TOKEN ? "set" : "missing"}`);
  lines.push(`[observability-monitor] sessionCookie=${SESSION_COOKIE ? "set" : "missing"}`);
  lines.push("");

  // Public pages
  const home = await fetchPage("/");
  addStep(lines, steps, {
    name: "GET /",
    method: "GET",
    url: "/",
    status: home.status,
    ok: home.ok,
    dataOk: home.ok,
    category: "page",
    error: home.ok ? undefined : `Unexpected status ${home.status}`,
  });

  const login = await fetchPage("/login");
  addStep(lines, steps, {
    name: "GET /login",
    method: "GET",
    url: "/login",
    status: login.status,
    ok: login.ok,
    dataOk: login.ok,
    category: "page",
    error: login.ok ? undefined : `Unexpected status ${login.status}`,
  });

  // Protected pages: /map and /deals
  const protectedPages = ["/map", "/deals"];
  for (const page of protectedPages) {
    const res = await fetchPage(page);
    const isRedirect = res.status >= 300 && res.status < 400;
    const redirectedToLogin = isRedirect && (res.location ?? "").includes("/login");
    const ok = SESSION_COOKIE ? res.ok : redirectedToLogin;
    const warning =
      !SESSION_COOKIE && redirectedToLogin
        ? "No session cookie; only verified login redirect"
        : undefined;

    addStep(lines, steps, {
      name: `GET ${page}`,
      method: "GET",
      url: page,
      status: res.status,
      ok,
      dataOk: ok,
      category: "page",
      warning,
      error: ok ? undefined : `Unexpected status ${res.status}`,
    });
  }

  // API: health
  if (!HEALTH_TOKEN) {
    addStep(lines, steps, {
      name: "GET /api/health",
      method: "GET",
      url: "/api/health",
      status: 0,
      ok: false,
      dataOk: false,
      category: "api",
      skipped: true,
      warning: "Missing HEALTH_TOKEN/HEALTHCHECK_TOKEN",
    });
  } else {
    const health = await fetchJson("GET", "/api/health");
    const healthObj = toRecord(health.data);
    const healthOk =
      health.ok &&
      (healthObj?.status === "ok" || healthObj?.status === "degraded");

    addStep(lines, steps, {
      name: "GET /api/health",
      method: "GET",
      url: "/api/health",
      status: health.status,
      ok: health.ok,
      dataOk: healthOk,
      category: "api",
      requestId: extractRequestId(health.headers),
      warning: extractRequestId(health.headers)
        ? undefined
        : "Missing request-id header",
      error: healthOk ? undefined : JSON.stringify(health.data).slice(0, 180),
    });
  }

  // API: auth-required endpoints
  if (!AUTH_BEARER) {
    const authRequiredPaths = [
      "GET /api/deals?limit=3",
      "GET /api/parcels?hasCoords=true",
      "GET /api/parcels?hasCoords=true&search=...",
      "GET /api/map/comps?address=...",
      "POST /api/map/prospect",
      "GET /api/parcels/{id}/geometry",
      "POST /api/observability/events",
    ];

    for (const name of authRequiredPaths) {
      addStep(lines, steps, {
        name,
        method: name.startsWith("POST") ? "POST" : "GET",
        url: name.split(" ").slice(1).join(" "),
        status: 0,
        ok: false,
        dataOk: false,
        category: name.includes("observability") ? "telemetry" : "api",
        skipped: true,
        warning: "Missing AUTH_BEARER",
      });
    }
  } else {
    const deals = await fetchJson("GET", "/api/deals?limit=3");
    const dealsObj = toRecord(deals.data);
    const dealsArr = Array.isArray(dealsObj?.deals) ? dealsObj.deals : [];
    const dealsOk = deals.ok && Array.isArray(dealsArr);

    addStep(lines, steps, {
      name: "GET /api/deals?limit=3",
      method: "GET",
      url: "/api/deals?limit=3",
      status: deals.status,
      ok: deals.ok,
      dataOk: dealsOk,
      category: "api",
      requestId: extractRequestId(deals.headers),
      warning: extractRequestId(deals.headers)
        ? undefined
        : "Missing request-id header",
      error:
        deals.status === 401
          ? "401 (auth required)"
          : dealsOk
            ? undefined
            : JSON.stringify(deals.data).slice(0, 180),
    });

    const parcels = await fetchJson("GET", "/api/parcels?hasCoords=true");
    const parcelsOk = parcels.ok && summarizeParcels(parcels.data);

    addStep(lines, steps, {
      name: "GET /api/parcels?hasCoords=true",
      method: "GET",
      url: "/api/parcels?hasCoords=true",
      status: parcels.status,
      ok: parcels.ok,
      dataOk: parcelsOk,
      category: "api",
      requestId: extractRequestId(parcels.headers),
      warning: extractRequestId(parcels.headers)
        ? undefined
        : "Missing request-id header",
      error:
        parcels.status === 401
          ? "401 (auth required)"
          : parcelsOk
            ? undefined
            : JSON.stringify(parcels.data).slice(0, 180),
    });

    const parcelsSearch = await fetchJson(
      "GET",
      `/api/parcels?hasCoords=true&search=${encodeURIComponent(SEARCH_ADDRESS)}`,
    );
    const parcelsSearchOk = parcelsSearch.ok && summarizeParcels(parcelsSearch.data);

    addStep(lines, steps, {
      name: "GET /api/parcels?hasCoords=true&search=...",
      method: "GET",
      url: "/api/parcels?hasCoords=true&search=...",
      status: parcelsSearch.status,
      ok: parcelsSearch.ok,
      dataOk: parcelsSearchOk,
      category: "api",
      requestId: extractRequestId(parcelsSearch.headers),
      warning: extractRequestId(parcelsSearch.headers)
        ? undefined
        : "Missing request-id header",
      error:
        parcelsSearch.status === 401
          ? "401 (auth required)"
          : parcelsSearchOk
            ? undefined
            : JSON.stringify(parcelsSearch.data).slice(0, 180),
    });

    const comps = await fetchJson(
      "GET",
      `/api/map/comps?address=${encodeURIComponent(SEARCH_ADDRESS)}&radiusMiles=2`,
    );
    const compsObj = toRecord(comps.data);
    const compsOk = comps.ok && (Array.isArray(compsObj?.comps) || compsObj?.comps === null);

    addStep(lines, steps, {
      name: "GET /api/map/comps?address=...",
      method: "GET",
      url: "/api/map/comps?address=...",
      status: comps.status,
      ok: comps.ok,
      dataOk: compsOk,
      category: "api",
      requestId: extractRequestId(comps.headers),
      warning: extractRequestId(comps.headers)
        ? undefined
        : "Missing request-id header",
      error:
        comps.status === 401
          ? "401 (auth required)"
          : compsOk
            ? undefined
            : JSON.stringify(comps.data).slice(0, 180),
    });

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

    const prospectObj = toRecord(prospect.data);
    const prospectArr = Array.isArray(prospectObj?.parcels) ? prospectObj.parcels : [];
    const prospectOk = prospect.ok && prospectArr.length > 0;

    addStep(lines, steps, {
      name: "POST /api/map/prospect",
      method: "POST",
      url: "/api/map/prospect",
      status: prospect.status,
      ok: prospect.ok,
      dataOk: prospectOk,
      category: "api",
      requestId: extractRequestId(prospect.headers),
      warning: extractRequestId(prospect.headers)
        ? undefined
        : "Missing request-id header",
      error:
        prospect.status === 401
          ? "401 (auth required)"
          : prospectOk
            ? undefined
            : JSON.stringify(prospect.data).slice(0, 180),
    });

    const candidateId = (() => {
      for (const source of [parcelsSearch.data, prospect.data]) {
        const obj = toRecord(source);
        const arr = Array.isArray(obj?.parcels) ? obj.parcels : [];
        for (const row of arr as Array<Record<string, unknown>>) {
          const id = row.propertyDbId ?? row.parcelUid ?? row.id;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      }
      return null;
    })();

    if (candidateId) {
      const geom = await fetchJson(
        "GET",
        `/api/parcels/${encodeURIComponent(candidateId)}/geometry?detail_level=low`,
      );
      const geomObj = toRecord(geom.data)?.data as Record<string, unknown> | undefined;
      const geomOk =
        geom.ok &&
        typeof geomObj?.geom_simplified === "string" &&
        geomObj.geom_simplified.length > 0;

      addStep(lines, steps, {
        name: "GET /api/parcels/{id}/geometry",
        method: "GET",
        url: "/api/parcels/{id}/geometry",
        status: geom.status,
        ok: geom.ok,
        dataOk: geomOk,
        category: "api",
        requestId: extractRequestId(geom.headers),
        warning: extractRequestId(geom.headers)
          ? undefined
          : "Missing request-id header",
        error: geomOk ? undefined : JSON.stringify(geom.data).slice(0, 180),
      });
    } else {
      addStep(lines, steps, {
        name: "GET /api/parcels/{id}/geometry",
        method: "GET",
        url: "/api/parcels/{id}/geometry",
        status: 0,
        ok: false,
        dataOk: false,
        category: "api",
        skipped: true,
        warning: "Skipped: no parcel id from parcels/prospect",
      });
    }

    if (EMIT_TELEMETRY) {
      const telemetry = await fetchJson("POST", OBS_ENDPOINT, {
        events: [
          {
            type: "route_view",
            timestamp: now.toISOString(),
            sessionId: `monitor-${Date.now()}`,
            pagePath: "/monitor",
            pageUrl: `${BASE_URL}/monitor`,
            userAgent: "observability-monitor",
          },
        ],
      });

      const telemetryOk = telemetry.ok && toRecord(telemetry.data)?.ok === true;

      addStep(lines, steps, {
        name: "POST /api/observability/events",
        method: "POST",
        url: OBS_ENDPOINT,
        status: telemetry.status,
        ok: telemetry.ok,
        dataOk: telemetryOk,
        category: "telemetry",
        requestId: extractRequestId(telemetry.headers),
        warning: extractRequestId(telemetry.headers)
          ? undefined
          : "Missing request-id header",
        error: telemetryOk ? undefined : JSON.stringify(telemetry.data).slice(0, 180),
      });
    } else {
      addStep(lines, steps, {
        name: "POST /api/observability/events",
        method: "POST",
        url: OBS_ENDPOINT,
        status: 0,
        ok: true,
        dataOk: true,
        category: "telemetry",
        skipped: true,
        warning: "OBS_EMIT_TELEMETRY=false",
      });
    }
  }

  lines.push("");

  const failed = steps.filter((s) => !s.skipped && (!s.ok || !s.dataOk));
  const skipped = steps.filter((s) => s.skipped);
  const warned = steps.filter((s) => s.warning);

  lines.push(`[observability-monitor] total=${steps.length} failed=${failed.length} warned=${warned.length} skipped=${skipped.length}`);

  const report = {
    runId: stamp,
    timestamp: now.toISOString(),
    baseUrl: BASE_URL,
    env: {
      authBearer: Boolean(AUTH_BEARER),
      healthToken: Boolean(HEALTH_TOKEN),
      sessionCookie: Boolean(SESSION_COOKIE),
      emitTelemetry: EMIT_TELEMETRY,
    },
    summary: {
      total: steps.length,
      failed: failed.length,
      warned: warned.length,
      skipped: skipped.length,
      allowPartial: ALLOW_PARTIAL,
    },
    steps,
  };

  const jsonPath = path.join(OUTPUT_DIR, `monitor-${stamp}.json`);
  const logPath = path.join(OUTPUT_DIR, `monitor-${stamp}.log`);
  const latestPath = path.join(OUTPUT_DIR, "monitor-latest.json");

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(logPath, `${lines.join("\n")}\n`, "utf8");

  for (const line of lines) {
    console.log(line);
  }
  console.log("");
  console.log(`[observability-monitor] wrote ${jsonPath}`);
  console.log(`[observability-monitor] wrote ${logPath}`);

  if ((failed.length > 0 || skipped.length > 0) && !ALLOW_PARTIAL) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
