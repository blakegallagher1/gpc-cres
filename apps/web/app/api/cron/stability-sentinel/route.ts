import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { prisma } from "@entitlement-os/db";
import { requestPropertyDbGateway } from "@/lib/server/propertyDbRpc";

export const runtime = "nodejs";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function verifyCronSecret(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!header || header.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(header));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProbeRun { status: number; totalMs: number; error?: string }

interface CheckResult {
  name: string;
  surface: "chat" | "map" | "workflow";
  status: "pass" | "fail" | "warn";
  value: number | string;
  threshold: number | string;
  detail: string;
}

interface WorkflowStats {
  totalEvents: number;
  failedEvents: number;
  transientFailures: number;
  duplicateKeyViolations: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const raw = process.env[`SENTINEL_${key}`];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[`SENTINEL_${key}`];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const THRESHOLDS = {
  chat405Max: envInt("CHAT_405_MAX_COUNT", 0),
  chat5xxRateMax: envFloat("CHAT_5XX_RATE_MAX", 0.05),
  mapParcelsP95MaxMs: envInt("MAP_PARCELS_P95_MAX_MS", 8000),
  mapSuggestP95MaxMs: envInt("MAP_SUGGEST_P95_MAX_MS", 8000),
  mapGeometryP95MaxMs: envInt("MAP_GEOMETRY_P95_MAX_MS", 10000),
  map5xxRateMax: envFloat("MAP_5XX_RATE_MAX", 0.1),
  mapGeometry429RateMax: envFloat("MAP_GEOMETRY_429_RATE_MAX", 0.15),
  workflowDuplicateMax: envInt("WORKFLOW_DUPLICATE_MAX_COUNT", 0),
  workflowTransientRateMax: envFloat("WORKFLOW_TRANSIENT_RATE_MAX", 0.3),
  workflowFailureRateMax: envFloat("WORKFLOW_FAILURE_RATE_MAX", 0.2),
  probeTimeoutMs: envInt("PROBE_TIMEOUT_MS", 15000),
  probeRuns: envInt("PROBE_RUNS", 3),
};

const BASE = (process.env.BASE_URL ?? "https://gallagherpropco.com").replace(/\/$/, "");
const SENTINEL_GEOMETRY_PARCEL_ID =
  process.env.SENTINEL_GEOMETRY_PARCEL_ID?.trim() ??
  "2438159d-fbc4-401a-819b-583c5ad79008";
const PRODUCTION_MODE = process.env.SENTINEL_PRODUCTION_MODE === "false"
  ? false
  : BASE.includes("gallagherpropco.com");
const MAP_PROPERTY_DB_PROBE_SQL = "SELECT 1 AS ok FROM ebr_parcels LIMIT 1";
const MAP_PROPERTY_DB_PROBE_RUNS = Math.max(1, envInt("MAP_PROPERTY_DB_PROBE_RUNS", 1));
const MAP_PROPERTY_DB_PROBE_TIMEOUT_MS = Math.max(
  1500,
  Math.min(THRESHOLDS.probeTimeoutMs, Math.floor((maxDuration * 1000) / 2)),
);

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((sorted.length * p) / 100) - 1);
  return sorted[index] ?? 0;
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function statusCounts(runs: ProbeRun[]) {
  let auth = 0;
  let s405 = 0;
  let s429 = 0;
  let s5xx = 0;

  for (const run of runs) {
    if (run.status === 401 || run.status === 403) {
      auth += 1;
      continue;
    }

    if (run.status === 405) {
      s405 += 1;
      continue;
    }

    if (run.status === 429) {
      s429 += 1;
      continue;
    }

    if (run.status >= 500) {
      s5xx += 1;
    }
  }

  return {
    total: runs.length,
    auth,
    s405,
    s429,
    s5xx,
  };
}

function latencyEligibleMs(runs: ProbeRun[]): number[] {
  return runs
    .filter((run) => run.status >= 200 && run.status < 400)
    .map((run) => run.totalMs);
}

function isSelfHostedSentinelWebhook(webhookUrl: string): boolean {
  try {
    const parsedWebhook = new URL(webhookUrl);
    const parsedBase = new URL(BASE);
    return (
      parsedWebhook.hostname === parsedBase.hostname &&
      parsedWebhook.pathname === "/api/admin/sentinel-alerts"
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPropertyDbProbeRows(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (value.ok === false) {
    return false;
  }

  if (Array.isArray(value.rows)) {
    return value.rows.length > 0;
  }

  for (const candidate of [value.data, value.result, value.items, value.parcels]) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return true;
    }
    if (isRecord(candidate) && hasPropertyDbProbeRows(candidate)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// HTTP probes
// ---------------------------------------------------------------------------

async function runProbe(endpoint: string, method: string, body?: string): Promise<ProbeRun[]> {
  const runs: ProbeRun[] = [];
  for (let i = 0; i < THRESHOLDS.probeRuns; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), THRESHOLDS.probeTimeoutMs);
    const start = performance.now();
    try {
      const res = await fetch(`${BASE}${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json", "User-Agent": "SentinelCron/1.0" },
        signal: controller.signal,
        ...(body ? { body } : {}),
      });
      await res.text().catch(() => "");
      runs.push({ status: res.status, totalMs: Math.round(performance.now() - start) });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: "api.cron.stability-sentinel", method: "UNKNOWN" },
      });
      runs.push({
        status: 0,
        totalMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  return runs;
}

async function runPropertyDbProbe(): Promise<ProbeRun[]> {
  const runs: ProbeRun[] = [];

  for (let i = 0; i < MAP_PROPERTY_DB_PROBE_RUNS; i++) {
    const start = performance.now();
    try {
      const res = await requestPropertyDbGateway({
        routeTag: "/api/cron/stability-sentinel",
        path: "/tools/parcels.sql",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: MAP_PROPERTY_DB_PROBE_SQL,
          limit: 1,
        }),
        requestId: `sentinel-property-db-${i + 1}`,
        includeApiKey: true,
        cache: "no-store",
        timeoutMs: MAP_PROPERTY_DB_PROBE_TIMEOUT_MS,
        maxRetries: 0,
      });

      const totalMs = Math.round(performance.now() - start);
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        runs.push({
          status: res.status,
          totalMs,
          error: errorText.slice(0, 240) || `upstream ${res.status}`,
        });
        continue;
      }

      const payload = await res.json().catch(() => null);
      if (!hasPropertyDbProbeRows(payload)) {
        runs.push({
          status: 502,
          totalMs,
          error: "property-db probe returned no rows or invalid JSON",
        });
        continue;
      }

      runs.push({ status: 200, totalMs });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: "api.cron.stability-sentinel", method: "UNKNOWN" },
      });
      runs.push({
        status: 0,
        totalMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return runs;
}

// ---------------------------------------------------------------------------
// Workflow stats via Prisma (available in Vercel via Hyperdrive)
// ---------------------------------------------------------------------------

async function queryWorkflowStats(): Promise<WorkflowStats | null> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last 1h

    const [allEvents, failedEvents, transientEvents] = await Promise.all([
      prisma.automationEvent.count({ where: { startedAt: { gte: since } } }),
      prisma.automationEvent.count({ where: { startedAt: { gte: since }, status: "failed" } }),
      prisma.automationEvent.count({
        where: {
          startedAt: { gte: since },
          status: "failed",
          outputData: { path: ["errorCode"], string_starts_with: "TRANSIENT" },
        },
      }),
    ]);

    // Check for duplicate idempotency keys via raw query.
    // Guard: column may not exist in production if migration hasn't run yet.
    const dupRows = await prisma.$queryRaw<Array<{ dup_count: number }>>`
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'automation_events' AND column_name = 'idempotency_key'
        )
        THEN (
          SELECT count(*)::int
          FROM (
            SELECT idempotency_key
            FROM automation_events
            WHERE started_at >= ${since} AND idempotency_key IS NOT NULL
            GROUP BY idempotency_key
            HAVING count(*) > 1
          ) dupes
        )
        ELSE 0
      END AS dup_count
    `;

    return {
      totalEvents: allEvents,
      failedEvents,
      transientFailures: transientEvents,
      duplicateKeyViolations: dupRows[0]?.dup_count ?? 0,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.cron.stability-sentinel", method: "UNKNOWN" },
    });
    console.error("[sentinel-cron] Workflow stats query failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

function evaluate(
  chatRuns: ProbeRun[],
  propertyDbRuns: ProbeRun[],
  parcelsRuns: ProbeRun[],
  suggestRuns: ProbeRun[],
  geometryRuns: ProbeRun[],
  workflow: WorkflowStats | null,
): { verdict: string; checks: CheckResult[]; failCount: number; warnCount: number } {
  const checks: CheckResult[] = [];

  const chatCounts = statusCounts(chatRuns);
  const chat5xxRate = rate(chatCounts.s5xx, chatCounts.total);
  checks.push({
    name: "chat_405_count",
    surface: "chat",
    status: chatCounts.s405 > THRESHOLDS.chat405Max ? "fail" : "pass",
    value: chatCounts.s405,
    threshold: THRESHOLDS.chat405Max,
    detail:
      chatCounts.s405 > 0
        ? `${chatCounts.s405}/${chatCounts.total} probes returned 405`
        : `No 405 in ${chatCounts.total} probes`,
  });
  checks.push({
    name: "chat_5xx_rate",
    surface: "chat",
    status: chat5xxRate > THRESHOLDS.chat5xxRateMax ? "fail" : "pass",
    value: Number(chat5xxRate.toFixed(3)),
    threshold: THRESHOLDS.chat5xxRateMax,
    detail: `${chatCounts.s5xx}/${chatCounts.total} probes returned 5xx (${(chat5xxRate * 100).toFixed(1)}%)`,
  });

  const mapChecks = [
    { name: "map_parcels_p95", runs: parcelsRuns, threshold: THRESHOLDS.mapParcelsP95MaxMs },
    { name: "map_suggest_p95", runs: suggestRuns, threshold: THRESHOLDS.mapSuggestP95MaxMs },
    { name: "map_geometry_p95", runs: geometryRuns, threshold: THRESHOLDS.mapGeometryP95MaxMs },
  ];

  let mapTotal = 0;
  let map5xx = 0;
  const propertyDbFailures = propertyDbRuns.filter(
    (run) => run.status < 200 || run.status >= 400,
  );
  checks.push({
    name: "map_property_db_probe",
    surface: "map",
    status: propertyDbFailures.length > 0 ? "fail" : "pass",
    value: propertyDbRuns.length - propertyDbFailures.length,
    threshold: propertyDbRuns.length,
    detail:
      propertyDbFailures.length > 0
        ? `${propertyDbFailures.length}/${propertyDbRuns.length} gateway parcel probes failed${
            propertyDbFailures[0]?.error ? ` (${propertyDbFailures[0].error})` : ""
          }`
        : `Gateway parcel probe passed ${propertyDbRuns.length}/${propertyDbRuns.length} runs`,
  });

  for (const check of mapChecks) {
    const counts = statusCounts(check.runs);
    const latencies = latencyEligibleMs(check.runs);
    const p95 = percentile(latencies, 95);

    mapTotal += counts.total;
    map5xx += counts.s5xx;

    checks.push({
      name: check.name,
      surface: "map",
      status:
        latencies.length === 0
          ? "pass"
          : p95 > check.threshold
            ? "fail"
            : p95 > check.threshold * 0.8
              ? "warn"
              : "pass",
      value: p95,
      threshold: check.threshold,
      detail:
        latencies.length === 0
          ? `No latency samples (${counts.auth} auth-rejected probes excluded from SLO)`
          : `p95 latency: ${p95}ms (threshold: ${check.threshold}ms, samples: ${latencies.length})`,
    });
  }

  const geometry429Rate = rate(statusCounts(geometryRuns).s429, geometryRuns.length);
  const map5xxRate = rate(map5xx, mapTotal);
  checks.push({
    name: "map_5xx_rate",
    surface: "map",
    status: map5xxRate > THRESHOLDS.map5xxRateMax ? "fail" : "pass",
    value: Number(map5xxRate.toFixed(3)),
    threshold: THRESHOLDS.map5xxRateMax,
    detail: `${map5xx}/${mapTotal} map probes returned 5xx`,
  });
  checks.push({
    name: "map_geometry_429_rate",
    surface: "map",
    status:
      geometry429Rate > THRESHOLDS.mapGeometry429RateMax
        ? "fail"
        : geometry429Rate > THRESHOLDS.mapGeometry429RateMax * 0.5
          ? "warn"
          : "pass",
    value: Number(geometry429Rate.toFixed(3)),
    threshold: THRESHOLDS.mapGeometry429RateMax,
    detail: `${statusCounts(geometryRuns).s429}/${geometryRuns.length} geometry probes returned 429`,
  });

  if (workflow === null) {
    checks.push({
      name: "workflow_db_available",
      surface: "workflow",
      status: PRODUCTION_MODE ? "warn" : "pass",
      value: "unavailable",
      threshold: "connected",
      detail: PRODUCTION_MODE
        ? "Workflow DB query failed — cannot verify idempotency or failure rates."
        : "Workflow DB not configured outside production mode.",
    });
  } else if (workflow.totalEvents > 0) {
    checks.push({
      name: "workflow_duplicate_count",
      surface: "workflow",
      status: workflow.duplicateKeyViolations > THRESHOLDS.workflowDuplicateMax ? "fail" : "pass",
      value: workflow.duplicateKeyViolations,
      threshold: THRESHOLDS.workflowDuplicateMax,
      detail: `${workflow.duplicateKeyViolations} duplicate idempotency violations in last 1h`,
    });

    const transientRate = rate(workflow.transientFailures, workflow.totalEvents);
    checks.push({
      name: "workflow_transient_rate",
      surface: "workflow",
      status: transientRate > THRESHOLDS.workflowTransientRateMax ? "fail" : "pass",
      value: Number(transientRate.toFixed(3)),
      threshold: THRESHOLDS.workflowTransientRateMax,
      detail: `${workflow.transientFailures}/${workflow.totalEvents} transient failures (${(transientRate * 100).toFixed(1)}%)`,
    });

    const failRate = rate(workflow.failedEvents, workflow.totalEvents);
    checks.push({
      name: "workflow_failure_rate",
      surface: "workflow",
      status: failRate > THRESHOLDS.workflowFailureRateMax ? "fail" : "pass",
      value: Number(failRate.toFixed(3)),
      threshold: THRESHOLDS.workflowFailureRateMax,
      detail: `${workflow.failedEvents}/${workflow.totalEvents} total failures (${(failRate * 100).toFixed(1)}%)`,
    });
  } else {
    checks.push({
      name: "workflow_activity",
      surface: "workflow",
      status: "pass",
      value: 0,
      threshold: "n/a",
      detail: "No automation events in last 1h (idle).",
    });
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  return { verdict: failCount > 0 ? "FAIL" : "PASS", checks, failCount, warnCount };
}

// ---------------------------------------------------------------------------
// Alert dispatch + persistence
// ---------------------------------------------------------------------------

async function dispatchAlert(
  result: Record<string, unknown>,
  checks: CheckResult[],
): Promise<void> {
  // 1. Persist alert to DB
  try {
    await prisma.automationEvent.create({
      data: {
        orgId: "00000000-0000-0000-0000-000000000001",
        handlerName: "stability-sentinel",
        eventType: "sentinel.alert",
        status: "completed",
        inputData: result as object,
        outputData: {
          failedChecks: checks.filter((c) => c.status === "fail").map((c) => c.name),
          warnChecks: checks.filter((c) => c.status === "warn").map((c) => c.name),
        } as object,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
      },
    });
  } catch {
    // Silent — don't let persistence failure block alert
  }

  // 2. External webhook
  const webhookUrl = process.env.SENTINEL_ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl && !isSelfHostedSentinelWebhook(webhookUrl)) {
    const failedChecks = checks.filter((c) => c.status === "fail");
    const warnChecks = checks.filter((c) => c.status === "warn");
    const text = [
      `*Sentinel FAIL* (${failedChecks.length} fail, ${warnChecks.length} warn)`,
      ...failedChecks.map((c) => `- :red_circle: *${c.name}*: ${c.detail}`),
      ...warnChecks.map((c) => `- :large_orange_circle: *${c.name}*: ${c.detail}`),
      `Evaluated: ${new Date().toISOString()}`,
    ].join("\n");
    const webhookSecret =
      process.env.SENTINEL_WEBHOOK_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim() ??
      "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhookSecret) {
      headers.Authorization = `Bearer ${webhookSecret}`;
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    }).catch(() => {});
  }

  // 3. Sentry
  Sentry.captureMessage("Stability sentinel FAIL", {
    level: "warning",
    tags: { sentinel: true, verdict: "FAIL" },
    extra: result,
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [chatRuns, propertyDbRuns, parcelsRuns, suggestRuns, geometryRuns, workflow] = await Promise.all([
      runProbe("/api/agent/tools/execute", "POST", '{"toolName":"search_parcels","arguments":{}}'),
      runPropertyDbProbe(),
      runProbe("/api/parcels?hasCoords=true", "GET"),
      runProbe("/api/parcels/suggest?q=airline+hwy", "GET"),
      runProbe(`/api/parcels/${encodeURIComponent(SENTINEL_GEOMETRY_PARCEL_ID)}/geometry?detail_level=low`, "GET"),
      queryWorkflowStats(),
    ]);

    const { verdict, checks, failCount, warnCount } = evaluate(
      chatRuns,
      propertyDbRuns,
      parcelsRuns,
      suggestRuns,
      geometryRuns,
      workflow,
    );

    const result = {
      ok: true,
      verdict,
      checks,
      failCount,
      warnCount,
      passCount: checks.length - failCount - warnCount,
      workflow: workflow ?? "unavailable",
      probes: {
        chat: chatRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
        propertyDb: propertyDbRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
        parcels: parcelsRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
        suggest: suggestRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
        geometry: geometryRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
      },
      evaluatedAt: new Date().toISOString(),
    };

    if (verdict === "FAIL") {
      await dispatchAlert(result, checks);
    }

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.cron.stability-sentinel", method: "GET" },
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sentinel failed" },
      { status: 500 },
    );
  }
}
