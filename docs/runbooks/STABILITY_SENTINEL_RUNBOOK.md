# Stability Sentinel Runbook

Status: Authoritative
Authority: Canonical operating guide for production stability monitoring
Owner: Platform engineering
Last reviewed: 2026-03-10

## What It Does

Automated production health checks for three stabilized surfaces, running every 10 minutes via Vercel Cron:

| Surface | Checks | Thresholds |
|---------|--------|------------|
| **Chat** | 405 count on `/api/agent/tools/execute`, 5xx rate | 0 allowed 405s, <5% 5xx |
| **Map** | p95 latency for parcels/suggest/geometry, 5xx rate, 429 rate | 8s/8s/10s p95, <10% 5xx, <15% 429 |
| **Workflow** | DB availability, duplicate idempotency keys, transient failure rate, overall failure rate | Connected, 0 duplicates, <30% transient, <20% total failures |

## Two Runners

| Runner | Context | Workflow Stats | Latency SLO | Schedule |
|--------|---------|---------------|-------------|----------|
| **Vercel Cron** (`/api/cron/stability-sentinel`) | Inside Vercel — Prisma/Hyperdrive available | Queries `automation_events` via Prisma | Unauth probes (reachability + error rate only) | Every 10 min |
| **CLI** (`scripts/observability/stability-sentinel.ts`) | Local machine or CI | Via `DATABASE_URL` + raw `pg` (requires DB tunnel) | Authenticated probes via `LOCAL_API_KEY` + service headers | Manual / external cron |

## How to Run (CLI)

```bash
# Standard production run (uses LOCAL_API_KEY from .env for auth)
LOCAL_API_KEY=<key> pnpm exec tsx scripts/observability/stability-sentinel.ts

# Dry run (no alerts sent)
SENTINEL_DRY_RUN=true pnpm exec tsx scripts/observability/stability-sentinel.ts

# Forced failure (for testing alert path)
SENTINEL_FORCE_FAIL=true CRON_SECRET=<secret> \
  SENTINEL_ALERT_WEBHOOK_URL=https://gallagherpropco.com/api/admin/sentinel-alerts \
  pnpm exec tsx scripts/observability/stability-sentinel.ts

# With workflow stats (requires DB tunnel active)
DATABASE_URL=postgresql://postgres:postgres@localhost:54399/entitlement_os \
  pnpm exec tsx scripts/observability/stability-sentinel.ts
```

## Vercel Cron Config

```json
{
  "path": "/api/cron/stability-sentinel",
  "schedule": "*/10 * * * *"
}
```

Auth: `CRON_SECRET` via `Authorization: Bearer` header with `crypto.timingSafeEqual`.

**Why 10 minutes:** Balances detection speed (catches regressions within one deploy cycle) against probe cost (~6 requests/run). At 10min intervals, that's ~864 probes/day.

## Alert Pipeline

Alerts are delivered through three channels on failure:

1. **DB persistence** — Stored in `automation_events` table (handler: `stability-sentinel`, event: `sentinel.alert`) via internal POST to `/api/admin/sentinel-alerts`.
2. **External webhook** — If `SENTINEL_ALERT_WEBHOOK_URL` is set to a Slack/Discord incoming webhook URL, alert text is POSTed there.
3. **Sentry** — `Sentry.captureMessage("Stability sentinel FAIL")` with structured tags and check data.

**Query recent alerts:**
```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://gallagherpropco.com/api/admin/sentinel-alerts
```

## Vercel Env Vars

| Variable | Required | Notes |
|----------|----------|-------|
| `CRON_SECRET` | Yes | Cron route auth |
| `SENTINEL_PRODUCTION_MODE` | Yes | `true` — enforces workflow DB visibility |
| `SENTINEL_ALERT_WEBHOOK_URL` | Recommended | Self-hosted: `https://gallagherpropco.com/api/admin/sentinel-alerts`. Can also be Slack incoming webhook URL. |
| `LOCAL_API_KEY` | Set already | Used by CLI runner as auth token fallback |

## Threshold Tuning

All thresholds overridable via `SENTINEL_*` env vars:

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `SENTINEL_CHAT_405_MAX_COUNT` | 0 | Max 405 responses (any = fail) |
| `SENTINEL_CHAT_5XX_RATE_MAX` | 0.05 | Max 5xx rate |
| `SENTINEL_MAP_PARCELS_P95_MAX_MS` | 8000 | Max p95 latency for /api/parcels |
| `SENTINEL_MAP_SUGGEST_P95_MAX_MS` | 8000 | Max p95 latency for suggest |
| `SENTINEL_MAP_GEOMETRY_P95_MAX_MS` | 10000 | Max p95 latency for geometry |
| `SENTINEL_MAP_5XX_RATE_MAX` | 0.1 | Max 5xx rate across map endpoints |
| `SENTINEL_MAP_GEOMETRY_429_RATE_MAX` | 0.15 | Max 429 rate for geometry |
| `SENTINEL_WORKFLOW_DUPLICATE_MAX_COUNT` | 0 | Max duplicate idempotency violations |
| `SENTINEL_WORKFLOW_TRANSIENT_RATE_MAX` | 0.3 | Max transient failure rate |
| `SENTINEL_WORKFLOW_FAILURE_RATE_MAX` | 0.2 | Max overall failure rate |
| `SENTINEL_PROBE_TIMEOUT_MS` | 15000 | Per-probe HTTP timeout |
| `SENTINEL_PROBE_RUNS` | 3 | Probes per endpoint per run |

## Latency SLO Semantics

- **Unauthenticated probes** (Vercel cron): 401/403 responses are excluded from p95 latency calculation. These measure auth gate speed, not endpoint work. Error rates (5xx, 429) are still counted.
- **Authenticated probes** (CLI with `LOCAL_API_KEY`): Only 2xx/3xx responses contribute to p95. If auth token is invalid (all 401s), the check emits WARN.
- **WARN at 80%:** p95 latency triggers WARN when it reaches 80% of threshold (early drift detection).

## What to Do on Alert

### chat_405_count (CRITICAL)
The tool execute route is crashing. Previously caused by `skill-loader.ts` importing at module load time.
1. Check Vercel function logs for `/api/agent/tools/execute`
2. Look for "Unable to locate skills directory" or import errors
3. If present, the shell-workflow lazy init fix may have regressed

### chat_5xx_rate
Tool execution is failing server-side.
1. Check Vercel logs for error stack traces
2. Common causes: OpenAI API outage, Prisma connection failure, tool handler crash

### map_*_p95
Map API latency is elevated.
1. Check gateway health: `curl https://api.gallagherpropco.com/admin/health`
2. Check Cloudflare tunnel status
3. If parcels is slow: check fanout query count (should be 1 for baseline)
4. If suggest is slow: gateway text search over 560K parcels is inherently 4-6s. Threshold at 8s. WARN at 6.4s.

### map_geometry_429_rate
Geometry requests are being rate-limited.
1. Check `useParcelGeometry.ts` batch size (should be 8)
2. Check server-side rate limiter config in `/api/parcels/[parcelId]/geometry/route.ts` (50 req/10s/org)

### workflow_db_available
Workflow DB is unreachable.
1. **Vercel cron:** Check Prisma/Hyperdrive connectivity. If Hyperdrive config is stale, recreate.
2. **CLI runner:** Check `DATABASE_URL` env var and `cloudflared access tcp` DB tunnel.

### workflow_duplicate_count
Idempotency guard is failing.
1. Check unique index: `\d automation_events` should show `automation_events_idempotency_key_key`
2. Query: `SELECT idempotency_key, count(*) FROM automation_events WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING count(*) > 1`

### workflow_transient_rate / workflow_failure_rate
Automation handlers are failing at elevated rates.
1. Query: `SELECT handler_name, error, output_data->>'errorCode' FROM automation_events WHERE status = 'failed' ORDER BY started_at DESC LIMIT 20`
2. If TRANSIENT_UPSTREAM: check gateway/tunnel connectivity
3. If TRANSIENT_DB: check Prisma connection pool health

## Output Artifacts

Each run produces:
1. **JSON artifact** — machine-readable, suitable for dashboarding
2. **Markdown summary** — human-readable, with remediation hints on failure/warn
3. **Exit code** — 0 = PASS, 1 = FAIL, 2 = sentinel crash

## Files

| File | Purpose |
|------|---------|
| `apps/web/app/api/cron/stability-sentinel/route.ts` | Vercel Cron handler: probes + Prisma workflow stats + alert dispatch |
| `apps/web/app/api/admin/sentinel-alerts/route.ts` | Self-hosted webhook receiver: persists alerts to DB, queryable via GET |
| `scripts/observability/stability-sentinel.ts` | CLI runner: authenticated probes, raw pg workflow stats, full artifact output |
| `scripts/observability/sentinel-eval.ts` | Pure evaluation engine: input to verdict + artifact (no I/O, fully testable) |
| `scripts/observability/sentinel-config.ts` | Threshold config with env-based overrides |
| `scripts/observability/sentinel-eval.test.ts` | 21 tests covering pass/fail/warn, latency SLO, workflow visibility, cron config |
