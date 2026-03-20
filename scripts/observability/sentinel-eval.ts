/**
 * Stability Sentinel — Evaluation Engine
 *
 * Pure logic: takes probe results + thresholds → produces pass/fail verdict,
 * structured JSON artifact, and markdown summary.
 * No I/O — fully testable in isolation.
 */

import type { SentinelThresholds } from "./sentinel-config.js";

// ---------------------------------------------------------------------------
// Input types (produced by probe runner)
// ---------------------------------------------------------------------------

export interface ProbeResult {
  endpoint: string;
  method: string;
  /** true when the probe was sent with a valid auth token */
  authenticated: boolean;
  runs: Array<{
    status: number;
    ttfbMs: number;
    totalMs: number;
    error?: string;
  }>;
}

export interface WorkflowStats {
  totalEvents: number;
  failedEvents: number;
  transientFailures: number;
  permanentFailures: number;
  duplicateKeyViolations: number;
}

export interface SentinelInput {
  probes: ProbeResult[];
  /** null = DB was unreachable, distinct from empty stats (0 events) */
  workflow: WorkflowStats | null;
  /** true when running in production environment */
  productionMode: boolean;
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "fail" | "warn";

export interface CheckResult {
  name: string;
  surface: "chat" | "map" | "workflow";
  status: CheckStatus;
  value: number | string;
  threshold: number | string;
  detail: string;
}

export interface SentinelArtifact {
  version: 1;
  collectedAt: string;
  evaluatedAt: string;
  verdict: "PASS" | "FAIL";
  checks: CheckResult[];
  failCount: number;
  warnCount: number;
  passCount: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * p / 100) - 1);
  return sorted[idx];
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function findProbe(probes: ProbeResult[], endpoint: string): ProbeResult | undefined {
  return probes.find((p) => p.endpoint === endpoint);
}

function statusCounts(probe: ProbeResult): {
  total: number; ok: number; auth: number;
  s4xx: number; s5xx: number; s405: number; s429: number;
} {
  let ok = 0, auth = 0, s4xx = 0, s5xx = 0, s405 = 0, s429 = 0;
  for (const r of probe.runs) {
    if (r.status >= 200 && r.status < 400) ok++;
    else if (r.status === 401 || r.status === 403) { auth++; s4xx++; }
    else if (r.status === 405) { s405++; s4xx++; }
    else if (r.status === 429) { s429++; s4xx++; }
    else if (r.status >= 400 && r.status < 500) s4xx++;
    else if (r.status >= 500) s5xx++;
  }
  return { total: probe.runs.length, ok, auth, s4xx, s5xx, s405, s429 };
}

/**
 * Extract latency-eligible runs.
 * - Authenticated probes: use 2xx/3xx responses only.
 * - Unauthenticated probes: 401/403 are expected — exclude from latency
 *   calculation entirely (they measure auth rejection speed, not endpoint work).
 */
function latencyEligibleMs(probe: ProbeResult): number[] {
  if (probe.authenticated) {
    // Auth token was sent — only 2xx/3xx carry meaningful latency
    return probe.runs
      .filter((r) => r.status >= 200 && r.status < 400)
      .map((r) => r.totalMs);
  }
  // Unauth probes — exclude 401/403 (auth gate), exclude 0 (network error)
  // Only 2xx/3xx (unlikely without auth) carry valid latency.
  // 405/429/5xx still count as they indicate route-level behavior.
  return probe.runs
    .filter((r) => r.status >= 200 && r.status < 400)
    .map((r) => r.totalMs);
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function evaluate(input: SentinelInput, thresholds: SentinelThresholds): SentinelArtifact {
  const checks: CheckResult[] = [];

  // ── Chat checks ──────────────────────────────────────────────────────
  const chatProbe = findProbe(input.probes, "/api/agent/tools/execute");
  if (chatProbe) {
    const counts = statusCounts(chatProbe);

    checks.push({
      name: "chat_405_count",
      surface: "chat",
      status: counts.s405 > thresholds.chat405MaxCount ? "fail" : "pass",
      value: counts.s405,
      threshold: thresholds.chat405MaxCount,
      detail: counts.s405 > 0
        ? `${counts.s405} of ${counts.total} probes returned 405 — tool execute route is broken`
        : `No 405 responses in ${counts.total} probes`,
    });

    // 5xx rate: count against all probes (not just auth-eligible)
    const fiveXxRate = rate(counts.s5xx, counts.total);
    checks.push({
      name: "chat_5xx_rate",
      surface: "chat",
      status: fiveXxRate > thresholds.chat5xxRateMax ? "fail" : "pass",
      value: Number(fiveXxRate.toFixed(3)),
      threshold: thresholds.chat5xxRateMax,
      detail: `${counts.s5xx}/${counts.total} probes returned 5xx (${(fiveXxRate * 100).toFixed(1)}%)`,
    });
  }

  // ── Map checks ───────────────────────────────────────────────────────
  const mapEndpoints: Array<{ key: string; endpoint: string; p95Max: number }> = [
    { key: "parcels", endpoint: "/api/parcels", p95Max: thresholds.mapParcelsP95MaxMs },
    { key: "suggest", endpoint: "/api/parcels/suggest", p95Max: thresholds.mapSuggestP95MaxMs },
    { key: "geometry", endpoint: "/api/parcels/{id}/geometry", p95Max: thresholds.mapGeometryP95MaxMs },
  ];

  let mapTotalProbes = 0;
  let map5xxTotal = 0;
  let map429Total = 0;
  let mapGeometryTotal = 0;

  for (const ep of mapEndpoints) {
    const probe = findProbe(input.probes, ep.endpoint);
    if (!probe) continue;

    const counts = statusCounts(probe);
    mapTotalProbes += counts.total;
    map5xxTotal += counts.s5xx;
    if (ep.key === "geometry") {
      map429Total += counts.s429;
      mapGeometryTotal += counts.total;
    }

    const latencies = latencyEligibleMs(probe);
    const p95 = percentile(latencies, 95);
    const hasSamples = latencies.length > 0;
    checks.push({
      name: `map_${ep.key}_p95`,
      surface: "map",
      status: !hasSamples
        ? (probe.authenticated ? "warn" : "pass") // no auth = expected 0 samples
        : p95 > ep.p95Max ? "fail"
        : p95 > ep.p95Max * 0.8 ? "warn"
        : "pass",
      value: p95,
      threshold: ep.p95Max,
      detail: hasSamples
        ? `p95 latency: ${p95}ms (threshold: ${ep.p95Max}ms, samples: ${latencies.length})`
        : `No latency samples (${counts.auth} auth-rejected probes excluded from SLO)`,
    });
  }

  if (mapTotalProbes > 0) {
    const map5xxRate = rate(map5xxTotal, mapTotalProbes);
    checks.push({
      name: "map_5xx_rate",
      surface: "map",
      status: map5xxRate > thresholds.map5xxRateMax ? "fail" : "pass",
      value: Number(map5xxRate.toFixed(3)),
      threshold: thresholds.map5xxRateMax,
      detail: `${map5xxTotal}/${mapTotalProbes} map probes returned 5xx`,
    });
  }

  if (mapGeometryTotal > 0) {
    const geo429Rate = rate(map429Total, mapGeometryTotal);
    checks.push({
      name: "map_geometry_429_rate",
      surface: "map",
      status: geo429Rate > thresholds.mapGeometry429RateMax
        ? "fail"
        : geo429Rate > thresholds.mapGeometry429RateMax * 0.5 ? "warn" : "pass",
      value: Number(geo429Rate.toFixed(3)),
      threshold: thresholds.mapGeometry429RateMax,
      detail: `${map429Total}/${mapGeometryTotal} geometry probes returned 429`,
    });
  }

  // ── Workflow checks ──────────────────────────────────────────────────
  if (input.workflow === null) {
    // DB was unreachable
    const status: CheckStatus = input.productionMode ? "warn" : "pass";
    checks.push({
      name: "workflow_db_available",
      surface: "workflow",
      status,
      value: "unavailable",
      threshold: "connected",
      detail: input.productionMode
        ? "Workflow DB unreachable in production — cannot verify idempotency or failure rates. Set DATABASE_URL or fix DB tunnel."
        : "Workflow DB not configured (non-production, skipped).",
    });
  } else {
    const wf = input.workflow;
    if (wf.totalEvents > 0) {
      checks.push({
        name: "workflow_duplicate_count",
        surface: "workflow",
        status: wf.duplicateKeyViolations > thresholds.workflowDuplicateMaxCount ? "fail" : "pass",
        value: wf.duplicateKeyViolations,
        threshold: thresholds.workflowDuplicateMaxCount,
        detail: `${wf.duplicateKeyViolations} duplicate idempotency key violations`,
      });

      const transientRate = rate(wf.transientFailures, wf.totalEvents);
      checks.push({
        name: "workflow_transient_rate",
        surface: "workflow",
        status: transientRate > thresholds.workflowTransientRateMax
          ? "fail"
          : transientRate > thresholds.workflowTransientRateMax * 0.6 ? "warn" : "pass",
        value: Number(transientRate.toFixed(3)),
        threshold: thresholds.workflowTransientRateMax,
        detail: `${wf.transientFailures}/${wf.totalEvents} events had transient failures (${(transientRate * 100).toFixed(1)}%)`,
      });

      const failRate = rate(wf.failedEvents, wf.totalEvents);
      checks.push({
        name: "workflow_failure_rate",
        surface: "workflow",
        status: failRate > thresholds.workflowFailureRateMax
          ? "fail"
          : failRate > thresholds.workflowFailureRateMax * 0.6 ? "warn" : "pass",
        value: Number(failRate.toFixed(3)),
        threshold: thresholds.workflowFailureRateMax,
        detail: `${wf.failedEvents}/${wf.totalEvents} events failed (${(failRate * 100).toFixed(1)}%)`,
      });
    } else {
      checks.push({
        name: "workflow_activity",
        surface: "workflow",
        status: "pass",
        value: 0,
        threshold: "n/a",
        detail: "No automation events in window (idle — no failures to report).",
      });
    }
  }

  // ── Verdict ──────────────────────────────────────────────────────────
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const passCount = checks.filter((c) => c.status === "pass").length;
  const verdict = failCount > 0 ? "FAIL" : "PASS";

  return {
    version: 1,
    collectedAt: input.collectedAt,
    evaluatedAt: new Date().toISOString(),
    verdict,
    checks,
    failCount,
    warnCount,
    passCount,
    summary: buildSummary(verdict, checks, failCount, warnCount, passCount),
  };
}

// ---------------------------------------------------------------------------
// Markdown summary
// ---------------------------------------------------------------------------

function buildSummary(
  verdict: string,
  checks: CheckResult[],
  failCount: number,
  warnCount: number,
  passCount: number,
): string {
  const icon = verdict === "PASS" ? "OK" : "ALERT";
  const lines: string[] = [
    `# Stability Sentinel [${icon}]`,
    "",
    `**Verdict:** ${verdict} | ${passCount} pass, ${warnCount} warn, ${failCount} fail`,
    "",
  ];

  const bySurface = new Map<string, CheckResult[]>();
  for (const c of checks) {
    const list = bySurface.get(c.surface) ?? [];
    list.push(c);
    bySurface.set(c.surface, list);
  }

  for (const [surface, surfaceChecks] of bySurface) {
    lines.push(`## ${surface}`);
    for (const c of surfaceChecks) {
      const badge = c.status === "pass" ? "[PASS]" : c.status === "warn" ? "[WARN]" : "[FAIL]";
      lines.push(`- ${badge} **${c.name}**: ${c.detail}`);
    }
    lines.push("");
  }

  if (failCount > 0 || checks.some((c) => c.status === "warn")) {
    lines.push("## Remediation");
    for (const c of checks.filter((c) => c.status === "fail" || c.status === "warn")) {
      const hint = REMEDIATION_HINTS[c.name] ?? "Investigate logs for this surface.";
      lines.push(`- **${c.name}**: ${hint}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const REMEDIATION_HINTS: Record<string, string> = {
  chat_405_count: "The tool execute route is returning 405. Check for shell-workflow import crash or route misconfiguration. See docs/archive/2026-03-20-root-cleanup/PRODUCTION_VERIFICATION_REPORT.md.",
  chat_5xx_rate: "Tool execution is failing server-side. Check Vercel function logs for /api/agent/tools/execute errors.",
  map_parcels_p95: "Parcel list latency is elevated. Check gateway connectivity and fanout query count.",
  map_suggest_p95: "Suggest typeahead is slow. Check gateway search latency and parallel candidate logic.",
  map_geometry_p95: "Geometry fetch is slow. Check gateway /api/parcels/{id}/geometry response times.",
  map_5xx_rate: "Map endpoints are returning server errors. Check gateway health and Cloudflare tunnel status.",
  map_geometry_429_rate: "Geometry requests are being rate-limited. Consider reducing batch size or increasing rate limit capacity.",
  workflow_db_available: "Workflow DB is unreachable in production. Check DATABASE_URL env var and Cloudflare DB tunnel. Without DB access, idempotency and failure rates cannot be verified.",
  workflow_duplicate_count: "Duplicate idempotency key violations detected. Check if the unique index is intact and the dedup guard is functioning.",
  workflow_transient_rate: "High rate of transient workflow failures. Check gateway/DB connectivity and Cloudflare tunnel health.",
  workflow_failure_rate: "Overall workflow failure rate is elevated. Review automation_events table for error patterns.",
};
