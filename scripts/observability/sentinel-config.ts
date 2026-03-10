/**
 * Stability Sentinel — Threshold Configuration
 *
 * Central config for all sentinel checks. Every value can be overridden
 * via environment variable (prefix: SENTINEL_).
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[`SENTINEL_${key}`];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[`SENTINEL_${key}`];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface SentinelThresholds {
  /** Chat: max allowed 405 responses in window (any = fail) */
  chat405MaxCount: number;
  /** Chat: max 5xx rate (0-1) before fail */
  chat5xxRateMax: number;

  /** Map: max p95 latency (ms) for /api/parcels */
  mapParcelsP95MaxMs: number;
  /** Map: max p95 latency (ms) for /api/parcels/suggest */
  mapSuggestP95MaxMs: number;
  /** Map: max p95 latency (ms) for geometry endpoint */
  mapGeometryP95MaxMs: number;
  /** Map: max 5xx rate (0-1) across all map endpoints */
  map5xxRateMax: number;
  /** Map: max 429 rate (0-1) for geometry */
  mapGeometry429RateMax: number;

  /** Workflow: max duplicate idempotency key violations in window */
  workflowDuplicateMaxCount: number;
  /** Workflow: max TRANSIENT failure ratio (0-1) before alert */
  workflowTransientRateMax: number;
  /** Workflow: max total failure rate (0-1) */
  workflowFailureRateMax: number;

  /** Alert: webhook URL (empty = log-only, no HTTP alert) */
  alertWebhookUrl: string;
  /** Probe: timeout per HTTP probe (ms) */
  probeTimeoutMs: number;
  /** Probe: number of runs per endpoint for latency sampling */
  probeRuns: number;
}

export function loadThresholds(): SentinelThresholds {
  return {
    chat405MaxCount: envInt("CHAT_405_MAX_COUNT", 0),
    chat5xxRateMax: envFloat("CHAT_5XX_RATE_MAX", 0.05),

    mapParcelsP95MaxMs: envInt("MAP_PARCELS_P95_MAX_MS", 8000),
    mapSuggestP95MaxMs: envInt("MAP_SUGGEST_P95_MAX_MS", 8000),
    mapGeometryP95MaxMs: envInt("MAP_GEOMETRY_P95_MAX_MS", 10000),
    map5xxRateMax: envFloat("MAP_5XX_RATE_MAX", 0.1),
    mapGeometry429RateMax: envFloat("MAP_GEOMETRY_429_RATE_MAX", 0.15),

    workflowDuplicateMaxCount: envInt("WORKFLOW_DUPLICATE_MAX_COUNT", 0),
    workflowTransientRateMax: envFloat("WORKFLOW_TRANSIENT_RATE_MAX", 0.3),
    workflowFailureRateMax: envFloat("WORKFLOW_FAILURE_RATE_MAX", 0.2),

    alertWebhookUrl: process.env.SENTINEL_ALERT_WEBHOOK_URL ?? "",
    probeTimeoutMs: envInt("PROBE_TIMEOUT_MS", 15000),
    probeRuns: envInt("PROBE_RUNS", 3),
  };
}
