# Production Observability Monitor

Status: Authoritative
Authority: Production observability monitor operator runbook
Owner: Ops/on-call owner
Last reviewed: 2026-03-09

This is the canonical operator runbook for production observability checks.

Use this document to:

- run one-shot validation before/after deploys,
- run continuous background monitoring,
- interpret report output quickly,
- triage common production failures.

Core executables:

- `scripts/observability/monitor_production.ts` — one pass or loop; writes JSON + log artifacts.
- `scripts/observability/start_monitor_prod.sh` — wrapper for `start/stop/status/tail/restart`.
- `pnpm observability:monitor:prod` — direct command entrypoint.

## Quickstart (2 minutes)

1) Ensure auth tokens/cookies are available (bearer + health + session).

1) Run a one-pass production check:

```bash
BASE_URL=https://gallagherpropco.com \
OBS_AUTH_BEARER=<nextauth-jwt> \
OBS_HEALTH_TOKEN=<health-token> \
OBS_SESSION_COOKIE="__Secure-authjs.session-token=<value>" \
OBS_LOOP=false \
pnpm observability:monitor:prod
```

1) Review artifacts:

- `output/observability/monitor-<timestamp>.json`
- `output/observability/monitor-<timestamp>.log`
- `output/observability/monitor-latest.json`

1) Gate outcome:

- `failed > 0` means at least one hard failure path needs investigation.
- `warned > 0` means route worked but contract/quality warnings exist.
- `skipped > 0` means the run had missing credentials/disabled checks.

## Scope

The monitor validates:

- Public page reachability (`/`, `/login`).
- Protected page behavior (`/map`, `/deals`) with optional session-cookie authorization.
- Critical production APIs:
  - `GET /api/health` (health-token protected)
  - `GET /api/deals`
  - `GET /api/parcels?hasCoords=true`
  - `GET /api/parcels?hasCoords=true&search=...`
  - `GET /api/map/comps?address=...`
  - `POST /api/map/prospect`
  - `GET /api/parcels/{id}/geometry`
  - `POST /api/observability/events` (telemetry ingest)

All checks are executed via the base site URL configured at runtime.

## Environment Variables

All variables are optional unless noted.

- `BASE_URL` — Preferred production base URL. Example: `https://gallagherpropco.com`.
- `OBS_BASE_URL` — Backward-compatible alias for base URL.
- `MAP_SMOKE_BASE_URL` — Backward-compatible alias used by legacy smoke scripts.
- `OBS_AUTH_BEARER` — Preferred bearer token for authenticated API checks.
- `AUTH_BEARER` — Compatible alias for the above.
- `MAP_SMOKE_AUTH_BEARER` — Legacy alias retained for older smoke scripts.
- `OBS_HEALTH_TOKEN` — Preferred token for `/api/health`.
- `HEALTH_TOKEN` — Compatible alias.
- `HEALTHCHECK_TOKEN` — Legacy alias.
- `OBS_SESSION_COOKIE` — Preferred value for checking protected page auth behavior.
- `SESSION_COOKIE` — Compatible alias.
- `AUTH_COOKIE` — Alternative alias.
- `OBS_SEARCH_ADDRESS` — Preferred address used for parcel/geospatial checks.
- `MAP_SMOKE_SEARCH_ADDRESS` — Legacy alias.
- `OBS_OUTPUT_DIR` — Override output directory (default: `output/observability`).
- `OBS_LOOP` — Set `true` to keep running repeatedly.
- `OBS_INTERVAL_MS` — Poll interval in loop mode (default `300000`).
- `OBS_MAX_CONSECUTIVE_FAILURES` — Exit after this many failed runs when loop is enabled.
- `OBS_MAX_REPORTS` — Cap on retained reports before pruning.
- `OBS_REQUEST_TIMEOUT_MS` — Per-request timeout in milliseconds.
- `OBS_ALLOW_PARTIAL` — When `true`, skipped checks do not force non-zero exit.
- `OBS_EMIT_TELEMETRY` — Set `false` to skip `/api/observability/events` POST.
- `OBS_MONITOR_ENV_FILE` or `MONITOR_ENV_FILE` — Dotenv path to preload.

The monitor also reads aliases with `OBS_`-prefixed values first and falls back to legacy names.

`OBS_SEARCH_ADDRESS` is used for the address-driven probes such as parcel search and comps lookup.
`POST /api/map/prospect` uses a canonical polygon-only payload so the route-health check does not fail on address-filter edge cases.

## Manual Run

```bash
BASE_URL=https://gallagherpropco.com OBS_AUTH_BEARER=<nextauth-jwt> OBS_HEALTH_TOKEN=<health-token> pnpm observability:monitor:prod
```

Useful aliases:

- `AUTH_BEARER=<nextauth-jwt>` if you do not set `OBS_AUTH_BEARER`.
- `HEALTH_TOKEN=<health-token>` if you do not set `OBS_HEALTH_TOKEN`.
- `SESSION_COOKIE=<session-cookie>` for `/map` and `/deals` checks.

Artifacts written:

- `output/observability/monitor-<timestamp>.json`
- `output/observability/monitor-<timestamp>.log`
- `output/observability/monitor-latest.json`

`monitor-<timestamp>.json` includes per-step metadata (`status`, `ok`, `dataOk`, `category`, `skipped`, and warnings) and an `env` summary.

## How to read results

- `ok=true`: request/flow completed successfully.
- `dataOk=true`: payload contract/content checks passed.
- `status`:
  - `ok` = healthy check
  - `warn` = functional but degraded contract/signal
  - `error` = failed check
  - `skipped` = not executed due to config/runtime flags
- `warnings[]`: actionable non-fatal issues (missing headers, redirects, partial checks).
- `error`: root failure payload from the check.

Priority order during triage:

1. `error` checks on auth, parcel search, prospecting, or telemetry ingest
1. persistent `warn` on missing request correlation headers
1. `skipped` checks caused by missing auth/health/session secrets

## Continuous Monitoring Wrapper

`start_monitor_prod.sh` loads `scripts/observability/.env.monitor-prod` by default and runs the monitor in background.

```bash
scripts/observability/start_monitor_prod.sh start
scripts/observability/start_monitor_prod.sh start --once   # run a single pass and exit
scripts/observability/start_monitor_prod.sh status
scripts/observability/start_monitor_prod.sh tail
scripts/observability/start_monitor_prod.sh stop
scripts/observability/start_monitor_prod.sh restart
```

Options:

- `-c, --config <path>`: custom env file (defaults to `scripts/observability/.env.monitor-prod`).
- `-o, --output <path>`: output directory (defaults to `output/observability`).
- `--once`: force single-pass execution, overriding loop mode from env.

Wrapper-tracked files:

- `monitor-prod.pid` — process id
- `monitor-prod.logpath` — active log file
- `monitor-prod.startinfo` — run metadata (`base_url`, `auth_bearer`, `health_token`, etc.)
- `monitor-prod.latest.log` — symlink to latest log

## Behavior Notes

- Public pages are accepted on success or redirect.
- Protected pages (`/map`, `/deals`) succeed when:
  - session cookie is present and request is 200, or
  - no session cookie is set and redirect to `/login` is observed.
- If `AUTH_BEARER` is absent, all authenticated API checks are marked as skipped with warning.
- If `HEALTH_TOKEN` is absent, `/api/health` is marked as skipped with warning.
- If `OBS_EMIT_TELEMETRY=false`, telemetry check is explicitly skipped.
- In single-run mode, any failed or skipped check exits non-zero unless `OBS_ALLOW_PARTIAL=true`.
- In loop mode, failures increment `consecutiveFailures`; loop exits only when max-consecutive limit is exceeded.

## Triage workflow

1) Run one-shot with explicit env values (avoid stale shell context).
2) Open latest JSON report and identify all `status=error`.
3) For each failed check:
   - verify route auth mode (public vs protected),
   - verify expected method/path,
   - verify response headers include request correlation ids,
   - verify latency against timeout (`OBS_REQUEST_TIMEOUT_MS`).
4) Re-run one-shot to confirm reproducibility.
5) If flaky only in loop mode, inspect interval/consecutive-fail settings.

## Common failure signatures

- `POST /api/observability/events` returns `405`
  - Likely wrong method on route or middleware/proxy path mismatch.
  - Verify handler implementation accepts `POST` in `apps/web/app/api/observability/events/route.ts`.
- `GET /api/parcels?hasCoords=true&search=...` timeout
  - Likely backend latency or gateway/db contention.
  - Verify gateway health and query path in `apps/web/app/api/parcels/route.ts`.
- `Missing request-id header` warnings
  - Response path is not attaching request correlation header.
  - Verify request-id attachment in route helpers (`attachRequestIdHeader`) and middleware behavior.
- unexpected redirects on protected routes
  - Session cookie invalid/expired or token mismatch with current prod session.

## Troubleshooting checklist

- `401` from `/api/health`: set `OBS_HEALTH_TOKEN` or `HEALTHCHECK_TOKEN`.
- Missing `/api/parcels/{id}/geometry` data: often token/cookie/scoping in dependent route checks.
- Wrapper prints warnings when `AUTH_BEARER`/`HEALTH_TOKEN`/`SESSION_COOKIE` are missing.
- If checks report redirects unexpectedly, verify the token and cookie used are from a valid production session.

## Security notes

- `scripts/observability/.env.monitor-prod` contains sensitive auth material; do not commit secrets.
- Rotate bearer/session tokens if shared outside trusted operators.
- Prefer shell env injection for ad hoc runs instead of persistent files when possible.
