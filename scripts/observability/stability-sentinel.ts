#!/usr/bin/env tsx
/**
 * Stability Sentinel — Production Runner
 *
 * Probes production endpoints, queries workflow health, evaluates against
 * thresholds, emits structured JSON + markdown artifact, and optionally
 * fires an alert webhook on failure.
 *
 * Usage:
 *   pnpm exec tsx scripts/observability/stability-sentinel.ts
 *
 * Env:
 *   BASE_URL                    — Production URL (default: https://gallagherpropco.com)
 *   SENTINEL_AUTH_TOKEN         — Bearer token for authenticated probes (latency SLO)
 *   SENTINEL_ALERT_WEBHOOK_URL  — Webhook for failure alerts (optional)
 *   SENTINEL_DRY_RUN            — "true" to skip alert dispatch
 *   SENTINEL_FORCE_FAIL         — "true" to inject a synthetic failure for testing
 *   SENTINEL_PRODUCTION_MODE    — "true" to enforce workflow DB availability (default: true when BASE_URL is production)
 *   DATABASE_URL                — Postgres connection for workflow stats (optional)
 *
 * All threshold overrides use SENTINEL_ prefix (see sentinel-config.ts).
 */

import { loadThresholds } from "./sentinel-config.js";
import { evaluate, type ProbeResult, type WorkflowStats, type SentinelInput, type SentinelArtifact } from "./sentinel-eval.js";

const BASE_URL = (process.env.BASE_URL ?? "https://gallagherpropco.com").replace(/\/$/, "");
const AUTH_TOKEN = process.env.SENTINEL_AUTH_TOKEN?.trim() ?? process.env.LOCAL_API_KEY?.trim() ?? "";
const AUTH_ORG_ID = process.env.SENTINEL_AUTH_ORG_ID?.trim() ?? "00000000-0000-0000-0000-000000000001";
const AUTH_USER_ID = process.env.SENTINEL_AUTH_USER_ID?.trim() ?? "00000000-0000-0000-0000-000000000002";
const DRY_RUN = process.env.SENTINEL_DRY_RUN === "true";
const FORCE_FAIL = process.env.SENTINEL_FORCE_FAIL === "true";
const PRODUCTION_MODE = process.env.SENTINEL_PRODUCTION_MODE === "false"
  ? false
  : BASE_URL.includes("gallagherpropco.com");

// ---------------------------------------------------------------------------
// HTTP probe
// ---------------------------------------------------------------------------

async function probe(
  endpoint: string,
  method: string,
  runs: number,
  timeoutMs: number,
  opts?: { body?: string; auth?: boolean },
): Promise<ProbeResult> {
  const results: ProbeResult["runs"] = [];
  const useAuth = opts?.auth && AUTH_TOKEN.length > 0;

  for (let i = 0; i < runs; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "StabilitySentinel/1.0",
      };
      if (useAuth) {
        // Use the coordinator-memory service token pattern accepted by resolveAuth
        headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
        headers["x-agent-tool-auth"] = "coordinator-memory";
        headers["x-agent-org-id"] = AUTH_ORG_ID;
        headers["x-agent-user-id"] = AUTH_USER_ID;
      }

      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        signal: controller.signal,
        ...(opts?.body ? { body: opts.body } : {}),
      });
      const elapsed = Math.round(performance.now() - start);
      await res.text().catch(() => "");
      const totalMs = Math.round(performance.now() - start);

      results.push({ status: res.status, ttfbMs: elapsed, totalMs });
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      results.push({
        status: 0,
        ttfbMs: elapsed,
        totalMs: elapsed,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    endpoint,
    method,
    authenticated: Boolean(useAuth),
    runs: results,
  };
}

// ---------------------------------------------------------------------------
// Workflow stats (via direct DB query if available, otherwise null)
// ---------------------------------------------------------------------------

async function queryWorkflowStats(): Promise<WorkflowStats | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    const windowMinutes = 60;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const statsResult = await client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'failed')::int AS failed,
        count(*) FILTER (WHERE status = 'failed' AND output_data->>'errorCode' LIKE 'TRANSIENT%')::int AS transient_failures,
        count(*) FILTER (WHERE status = 'failed' AND output_data->>'errorCode' NOT LIKE 'TRANSIENT%')::int AS permanent_failures
      FROM automation_events
      WHERE started_at >= $1
    `, [since]);

    const row = statsResult.rows[0] ?? {};

    // Guard: column may not exist in production if migration hasn't run yet.
    const dupResult = await client.query(`
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'automation_events' AND column_name = 'idempotency_key'
        )
        THEN (
          SELECT count(*)::int
          FROM (
            SELECT idempotency_key, count(*) AS cnt
            FROM automation_events
            WHERE started_at >= $1 AND idempotency_key IS NOT NULL
            GROUP BY idempotency_key
            HAVING count(*) > 1
          ) dupes
        )
        ELSE 0
      END AS dup_count
    `, [since]);

    await client.end();

    return {
      totalEvents: row.total ?? 0,
      failedEvents: row.failed ?? 0,
      transientFailures: row.transient_failures ?? 0,
      permanentFailures: row.permanent_failures ?? 0,
      duplicateKeyViolations: dupResult.rows[0]?.dup_count ?? 0,
    };
  } catch (err) {
    console.warn("[sentinel] Workflow stats query failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Alert dispatch
// ---------------------------------------------------------------------------

async function sendAlert(artifact: SentinelArtifact, webhookUrl: string): Promise<boolean> {
  const failedChecks = artifact.checks.filter((c) => c.status === "fail");
  const warnChecks = artifact.checks.filter((c) => c.status === "warn");
  const text = [
    `*Stability Sentinel FAIL* (${artifact.failCount} fail, ${artifact.warnCount} warn)`,
    "",
    ...failedChecks.map((c) => `- :red_circle: *${c.name}*: ${c.detail}`),
    ...warnChecks.map((c) => `- :large_orange_circle: *${c.name}*: ${c.detail}`),
    "",
    `Evaluated at: ${artifact.evaluatedAt}`,
  ].join("\n");

  if (DRY_RUN) {
    console.log("[sentinel] DRY_RUN: would send alert to", webhookUrl);
    console.log("[sentinel] Alert payload:", text);
    return true;
  }

  try {
    const webhookSecret = process.env.CRON_SECRET?.trim() ?? process.env.SENTINEL_WEBHOOK_SECRET?.trim() ?? "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhookSecret) headers["Authorization"] = `Bearer ${webhookSecret}`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, verdict: artifact.verdict, failCount: artifact.failCount, warnCount: artifact.warnCount, checks: artifact.checks, evaluatedAt: artifact.evaluatedAt }),
    });
    if (!res.ok) {
      console.error("[sentinel] Alert webhook returned", res.status);
      return false;
    }
    console.log("[sentinel] Alert sent to webhook");
    return true;
  } catch (err) {
    console.error("[sentinel] Alert dispatch failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[sentinel] Starting stability sentinel run against ${BASE_URL}`);
  console.log(`[sentinel] DRY_RUN=${DRY_RUN} FORCE_FAIL=${FORCE_FAIL} PRODUCTION_MODE=${PRODUCTION_MODE} AUTH=${AUTH_TOKEN ? "yes" : "no"}`);

  const thresholds = loadThresholds();
  const runs = thresholds.probeRuns;
  const timeout = thresholds.probeTimeoutMs;
  const hasAuth = AUTH_TOKEN.length > 0;

  // Run probes in parallel
  const [chatProbe, parcelsProbe, suggestProbe, geometryProbe, workflowStats] = await Promise.all([
    probe("/api/agent/tools/execute", "POST", runs, timeout, {
      body: '{"toolName":"search_parcels","arguments":{}}',
      auth: hasAuth,
    }),
    probe("/api/parcels?hasCoords=true", "GET", runs, timeout, { auth: hasAuth }),
    probe("/api/parcels/suggest?q=airline+hwy", "GET", runs, timeout, { auth: hasAuth }),
    probe("/api/parcels/2438159d-fbc4-401a-819b-583c5ad79008/geometry?detail_level=low", "GET", runs, timeout, { auth: hasAuth }),
    queryWorkflowStats(),
  ]);

  // Normalize endpoint names to match evaluator expectations
  parcelsProbe.endpoint = "/api/parcels";
  suggestProbe.endpoint = "/api/parcels/suggest";
  geometryProbe.endpoint = "/api/parcels/{id}/geometry";

  const input: SentinelInput = {
    probes: [chatProbe, parcelsProbe, suggestProbe, geometryProbe],
    workflow: workflowStats,
    productionMode: PRODUCTION_MODE,
    collectedAt: new Date().toISOString(),
  };

  // Inject synthetic failure for testing
  if (FORCE_FAIL) {
    input.probes[0].runs.push({ status: 405, ttfbMs: 100, totalMs: 100, error: "FORCE_FAIL injected" });
  }

  const artifact = evaluate(input, thresholds);

  // Output JSON artifact
  console.log("\n=== SENTINEL ARTIFACT (JSON) ===");
  console.log(JSON.stringify(artifact, null, 2));

  // Output markdown summary
  console.log("\n=== SENTINEL SUMMARY (Markdown) ===");
  console.log(artifact.summary);

  // Alert on failure
  if (artifact.verdict === "FAIL" && thresholds.alertWebhookUrl) {
    await sendAlert(artifact, thresholds.alertWebhookUrl);
  }

  // Exit code
  if (artifact.verdict === "FAIL") {
    console.log("\n[sentinel] VERDICT: FAIL");
    process.exit(1);
  } else {
    console.log("\n[sentinel] VERDICT: PASS");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[sentinel] Fatal error:", err);
  process.exit(2);
});
