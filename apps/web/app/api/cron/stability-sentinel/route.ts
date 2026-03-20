import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import crypto from "node:crypto";
import { prisma } from "@entitlement-os/db";

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
  surface: string;
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

const THRESHOLDS = {
  chat405Max: 0,
  chat5xxRateMax: 0.05,
  map5xxRateMax: 0.1,
  workflowDuplicateMax: 0,
  workflowTransientRateMax: 0.3,
  workflowFailureRateMax: 0.2,
};

const PROBE_TIMEOUT_MS = 12000;
const PROBE_RUNS = 2;
const BASE = "https://gallagherpropco.com";

// ---------------------------------------------------------------------------
// HTTP probes
// ---------------------------------------------------------------------------

async function runProbe(endpoint: string, method: string, body?: string): Promise<ProbeRun[]> {
  const runs: ProbeRun[] = [];
  for (let i = 0; i < PROBE_RUNS; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
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

    // Check for duplicate idempotency keys via raw query
    const dupRows = await prisma.$queryRaw<Array<{ dup_count: number }>>`
      SELECT count(*)::int AS dup_count
      FROM (
        SELECT idempotency_key
        FROM automation_events
        WHERE started_at >= ${since} AND idempotency_key IS NOT NULL
        GROUP BY idempotency_key
        HAVING count(*) > 1
      ) dupes
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
  parcelsRuns: ProbeRun[],
  suggestRuns: ProbeRun[],
  workflow: WorkflowStats | null,
): { verdict: string; checks: CheckResult[]; failCount: number; warnCount: number } {
  const checks: CheckResult[] = [];

  // Chat 405
  const chat405 = chatRuns.filter((r) => r.status === 405).length;
  checks.push({
    name: "chat_405_count", surface: "chat",
    status: chat405 > THRESHOLDS.chat405Max ? "fail" : "pass",
    value: chat405, threshold: THRESHOLDS.chat405Max,
    detail: chat405 > 0 ? `${chat405}/${chatRuns.length} probes returned 405` : `No 405 in ${chatRuns.length} probes`,
  });

  // Overall 5xx
  const allRuns = [...chatRuns, ...parcelsRuns, ...suggestRuns];
  const total5xx = allRuns.filter((r) => r.status >= 500).length;
  const rate5xx = allRuns.length > 0 ? total5xx / allRuns.length : 0;
  checks.push({
    name: "overall_5xx_rate", surface: "chat",
    status: rate5xx > THRESHOLDS.chat5xxRateMax ? "fail" : "pass",
    value: Number(rate5xx.toFixed(3)), threshold: THRESHOLDS.chat5xxRateMax,
    detail: `${total5xx}/${allRuns.length} probes returned 5xx (${(rate5xx * 100).toFixed(1)}%)`,
  });

  // Workflow
  if (workflow === null) {
    checks.push({
      name: "workflow_db_available", surface: "workflow",
      status: "warn", value: "unavailable", threshold: "connected",
      detail: "Workflow DB query failed — cannot verify idempotency or failure rates.",
    });
  } else if (workflow.totalEvents > 0) {
    checks.push({
      name: "workflow_duplicate_count", surface: "workflow",
      status: workflow.duplicateKeyViolations > THRESHOLDS.workflowDuplicateMax ? "fail" : "pass",
      value: workflow.duplicateKeyViolations, threshold: THRESHOLDS.workflowDuplicateMax,
      detail: `${workflow.duplicateKeyViolations} duplicate idempotency violations in last 1h`,
    });

    const transientRate = workflow.totalEvents > 0 ? workflow.transientFailures / workflow.totalEvents : 0;
    checks.push({
      name: "workflow_transient_rate", surface: "workflow",
      status: transientRate > THRESHOLDS.workflowTransientRateMax ? "fail" : "pass",
      value: Number(transientRate.toFixed(3)), threshold: THRESHOLDS.workflowTransientRateMax,
      detail: `${workflow.transientFailures}/${workflow.totalEvents} transient failures (${(transientRate * 100).toFixed(1)}%)`,
    });

    const failRate = workflow.totalEvents > 0 ? workflow.failedEvents / workflow.totalEvents : 0;
    checks.push({
      name: "workflow_failure_rate", surface: "workflow",
      status: failRate > THRESHOLDS.workflowFailureRateMax ? "fail" : "pass",
      value: Number(failRate.toFixed(3)), threshold: THRESHOLDS.workflowFailureRateMax,
      detail: `${workflow.failedEvents}/${workflow.totalEvents} total failures (${(failRate * 100).toFixed(1)}%)`,
    });
  } else {
    checks.push({
      name: "workflow_activity", surface: "workflow",
      status: "pass", value: 0, threshold: "n/a",
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
  if (webhookUrl) {
    const failedChecks = checks.filter((c) => c.status === "fail");
    const warnChecks = checks.filter((c) => c.status === "warn");
    const text = [
      `*Sentinel FAIL* (${failedChecks.length} fail, ${warnChecks.length} warn)`,
      ...failedChecks.map((c) => `- :red_circle: *${c.name}*: ${c.detail}`),
      ...warnChecks.map((c) => `- :large_orange_circle: *${c.name}*: ${c.detail}`),
      `Evaluated: ${new Date().toISOString()}`,
    ].join("\n");

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const [chatRuns, parcelsRuns, suggestRuns, workflow] = await Promise.all([
      runProbe("/api/agent/tools/execute", "POST", '{"toolName":"search_parcels","arguments":{}}'),
      runProbe("/api/parcels?hasCoords=true", "GET"),
      runProbe("/api/parcels/suggest?q=airline", "GET"),
      queryWorkflowStats(),
    ]);

    const { verdict, checks, failCount, warnCount } = evaluate(chatRuns, parcelsRuns, suggestRuns, workflow);

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
        parcels: parcelsRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
        suggest: suggestRuns.map((r) => ({ status: r.status, ms: r.totalMs })),
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
    Sentry.captureException(error, { tags: { sentinel: true } });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sentinel failed" },
      { status: 500 },
    );
  }
}
