/**
 * Production observability monitor.
 *
 * Usage:
 *   BASE_URL=https://gallagherpropco.com \
 *   OBS_AUTH_BEARER=<jwt> \
 *   OBS_HEALTH_TOKEN=<health-token> \
 *   OBS_SESSION_COOKIE="__Secure-authjs.session-token=..." \
 *   OBS_SEARCH_ADDRESS="2774 HIGHLAND RD" \
 *   OBS_LOOP=true \
 *   OBS_MAX_CONSECUTIVE_FAILURES=3 \
 *   OBS_MAX_REPORTS=240 \
 *   pnpm exec tsx scripts/observability/monitor_production.ts
 *
 * Output:
 *   output/observability/monitor-<timestamp>.json
 *   output/observability/monitor-<timestamp>.log
 */

import path from "node:path";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { config } from "dotenv";

const DEFAULT_MONITOR_ENV = ".env";
const monitorEnvFile =
  process.env.OBS_MONITOR_ENV_FILE ??
  process.env.MONITOR_ENV_FILE ??
  DEFAULT_MONITOR_ENV;
const monitorEnvPath = path.resolve(process.cwd(), monitorEnvFile);

config({
  path: monitorEnvPath,
});

if (monitorEnvPath !== path.resolve(process.cwd(), DEFAULT_MONITOR_ENV)) {
  config({ path: path.resolve(process.cwd(), ".env"), override: false });
}

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
  "2774 HIGHLAND RD";

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OBS_OUTPUT_DIR ?? "output/observability",
);

const ALLOW_PARTIAL = (process.env.OBS_ALLOW_PARTIAL ?? "").toLowerCase() === "true";
const EMIT_TELEMETRY = (process.env.OBS_EMIT_TELEMETRY ?? "true").toLowerCase() !== "false";
const OBS_LOOP = (process.env.OBS_LOOP ?? "").toLowerCase() === "true";
const OBS_INTERVAL_MS = Number(process.env.OBS_INTERVAL_MS ?? "300000");
const OBS_MAX_CONSECUTIVE_FAILURES = (() => {
  const raw = Number(process.env.OBS_MAX_CONSECUTIVE_FAILURES ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
})();
const OBS_MAX_REPORTS = (() => {
  const raw = Number(process.env.OBS_MAX_REPORTS ?? "240");
  if (!Number.isFinite(raw) || raw < 0) return 240;
  return Math.floor(raw);
})();

const OBS_ENDPOINT = "/api/observability/events";
const OBS_REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env.OBS_REQUEST_TIMEOUT_MS ?? "20000");
  return Number.isFinite(raw) && raw > 0 ? raw : 20000;
})();

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

type FetchPageResult = {
  status: number;
  ok: boolean;
  location: string | null;
  error?: string;
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
    headers.get("x-vercel-id") ??
    headers.get("cf-ray") ??
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OBS_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${pathSuffix}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed) {
        data = null;
      } else {
        try {
          data = JSON.parse(trimmed);
        } catch {
          data = { raw: trimmed.slice(0, 200) };
        }
      }
    } catch {
      data = {
        error: "Failed to read response body",
      };
    }

    return { status: res.status, ok: res.ok, data, headers: res.headers };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Request timed out after ${OBS_REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      status: 0,
      ok: false,
      data: { error: message, timeoutMs: OBS_REQUEST_TIMEOUT_MS },
      headers: new Headers(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(pathSuffix: string): Promise<FetchPageResult> {
  const headers: Record<string, string> = {};
  if (SESSION_COOKIE) headers["Cookie"] = SESSION_COOKIE;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OBS_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${pathSuffix}`, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    return {
      status: res.status,
      ok: res.ok,
      location: res.headers.get("location"),
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Request timed out after ${OBS_REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      status: 0,
      ok: false,
      location: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ReportEntry = {
  runId: string;
  mtimeMs: number;
  paths: string[];
};

async function pruneOutputDir() {
  if (OBS_MAX_REPORTS === 0) {
    return { removed: 0, kept: 0, disabled: true };
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
  } catch (err) {
    return {
      removed: 0,
      kept: 0,
      disabled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const runs = new Map<string, ReportEntry>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^monitor-(.+)\.(json|log)$/);
    if (!match) continue;
    const runId = match[1];
    if (runId === "latest") continue;

    const filePath = path.join(OUTPUT_DIR, entry.name);
    let stats: { mtimeMs: number };
    try {
      stats = await fs.stat(filePath);
    } catch {
      continue;
    }

    const existing = runs.get(runId);
    if (existing) {
      existing.mtimeMs = Math.max(existing.mtimeMs, stats.mtimeMs);
      existing.paths.push(filePath);
    } else {
      runs.set(runId, { runId, mtimeMs: stats.mtimeMs, paths: [filePath] });
    }
  }

  const sorted = Array.from(runs.values()).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keep = sorted.slice(0, OBS_MAX_REPORTS);
  const remove = sorted.slice(OBS_MAX_REPORTS);

  let removed = 0;
  for (const entry of remove) {
    for (const filePath of entry.paths) {
      try {
        await fs.unlink(filePath);
        removed += 1;
      } catch {
        // best-effort cleanup
      }
    }
  }

  return { removed, kept: keep.length, disabled: false };
}

function buildMonitorSnapshot(
  now: Date,
  stamp: string,
  steps: StepResult[],
  failed: StepResult[],
  warned: StepResult[],
  skipped: StepResult[],
) {
  const summary =
    failed.length > 0
      ? `${failed.length} checks failed, ${warned.length} warned`
      : warned.length > 0
        ? `${warned.length} checks warned`
        : "All observability checks passed";

  return {
    source: "production-monitor",
    surface: "production",
    status:
      failed.length > 0
        ? "error"
        : warned.length > 0 || skipped.length > 0
          ? "warn"
          : "ok",
    summary,
    route: "/",
    details: {
      runId: stamp,
      recordedAt: now.toISOString(),
      totals: {
        total: steps.length,
        failed: failed.length,
        warned: warned.length,
        skipped: skipped.length,
      },
      failedChecks: failed.map((step) => ({
        name: step.name,
        status: step.status,
        requestId: step.requestId ?? null,
        error: step.error ?? null,
      })),
    },
  };
}

async function runOnce() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const now = new Date();
  const stamp = formatTimestamp(now);

  const steps: StepResult[] = [];
  const lines: string[] = [];

  lines.push(`[observability-monitor] base=${BASE_URL}`);
  lines.push(`[observability-monitor] authBearer=${AUTH_BEARER ? "set" : "missing"}`);
  lines.push(`[observability-monitor] healthToken=${HEALTH_TOKEN ? "set" : "missing"}`);
  lines.push(`[observability-monitor] sessionCookie=${SESSION_COOKIE ? "set" : "missing"}`);
  lines.push(
    `[observability-monitor] maxConsecutiveFailures=${OBS_MAX_CONSECUTIVE_FAILURES || "disabled"}`,
  );
  lines.push(
    `[observability-monitor] maxReports=${OBS_MAX_REPORTS === 0 ? "disabled" : OBS_MAX_REPORTS}`,
  );
  lines.push("");

  // Public pages
  const home = await fetchPage("/");
  const homeIsRedirect = home.status >= 300 && home.status < 400;
  const homeHasLocation = typeof home.location === "string" && home.location.length > 0;
  const homeOk = home.ok || (homeIsRedirect && homeHasLocation);
  const homeWarning = homeIsRedirect
    ? SESSION_COOKIE
      ? `Redirected to ${home.location ?? "unknown"}`
      : (home.location ?? "").includes("/login")
        ? "No session cookie; verified login redirect"
        : `Redirected to ${home.location ?? "unknown"}`
    : undefined;
  addStep(lines, steps, {
    name: "GET /",
    method: "GET",
    url: "/",
    status: home.status,
    ok: homeOk,
    dataOk: homeOk,
    category: "page",
    warning: homeWarning,
    error: homeOk ? undefined : home.error ?? `Unexpected status ${home.status}`,
  });

  const login = await fetchPage("/login");
  const loginOk = login.ok || login.status === 307 || login.status === 302;
  addStep(lines, steps, {
    name: "GET /login",
    method: "GET",
    url: "/login",
    status: login.status,
    ok: loginOk,
    dataOk: loginOk,
    category: "page",
    warning: loginOk ? undefined : login.error ?? `Unexpected status ${login.status}`,
    error: loginOk ? undefined : `Redirect target not reachable`,
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
      error: ok ? undefined : res.error ?? `Unexpected status ${res.status}`,
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
      const preflightFailed = steps.filter((s) => !s.skipped && (!s.ok || !s.dataOk));
      const preflightSkipped = steps.filter((s) => s.skipped);
      const preflightWarned = steps.filter((s) => s.warning);
      const monitorSnapshot = buildMonitorSnapshot(
        now,
        stamp,
        steps,
        preflightFailed,
        preflightWarned,
        preflightSkipped,
      );

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
        monitorSnapshots: [monitorSnapshot],
      });

      const telemetryObj = toRecord(telemetry.data);
      const telemetryCounts = toRecord(telemetryObj?.counts);
      const telemetryOk =
        telemetry.ok &&
        telemetryObj?.ok === true &&
        telemetryCounts?.monitorSnapshots === 1;

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

  try {
    const retention = await pruneOutputDir();
    if (retention.disabled) {
      console.log("[observability-monitor] retention disabled");
    } else if (retention.error) {
      console.warn(`[observability-monitor] retention error: ${retention.error}`);
    } else if (retention.removed > 0) {
      console.log(
        `[observability-monitor] retention removed ${retention.removed} files (kept ${retention.kept} runs)`,
      );
    }
  } catch (err) {
    console.warn(
      `[observability-monitor] retention failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  for (const line of lines) {
    console.log(line);
  }
  console.log("");
  console.log(`[observability-monitor] wrote ${jsonPath}`);
  console.log(`[observability-monitor] wrote ${logPath}`);

  const shouldFail = (failed.length > 0 || skipped.length > 0) && !ALLOW_PARTIAL;

  return {
    shouldFail,
    stamp,
    jsonPath,
    logPath,
    report,
  };
}

async function main() {
  if (!OBS_LOOP) {
    const result = await runOnce();
    if (result.shouldFail) {
      process.exit(1);
    }
    return;
  }

  console.log(`[observability-monitor] loop=true intervalMs=${OBS_INTERVAL_MS}`);
  let consecutiveFailures = 0;
  for (;;) {
    try {
      const result = await runOnce();
      if (result.shouldFail) {
        consecutiveFailures += 1;
        console.error(
          `[observability-monitor] run=${result.stamp} completed with failing checks; continuing loop`,
        );
      } else {
        consecutiveFailures = 0;
      }
    } catch (err) {
      consecutiveFailures += 1;
      console.error("[observability-monitor] loop iteration failed", err);
    }
    if (
      OBS_MAX_CONSECUTIVE_FAILURES > 0 &&
      consecutiveFailures >= OBS_MAX_CONSECUTIVE_FAILURES
    ) {
      console.error(
        `[observability-monitor] consecutiveFailures=${consecutiveFailures} exceeded limit=${OBS_MAX_CONSECUTIVE_FAILURES}; exiting`,
      );
      process.exit(1);
    }
    await sleep(OBS_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
