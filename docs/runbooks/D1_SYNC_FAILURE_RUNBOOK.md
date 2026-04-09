# D1 Sync Failure Runbook

Last reviewed: 2026-04-09

## Purpose

Diagnose when the Cloudflare gateway proxy is serving stale or fallback data because the Windows-host -> D1 sync path is failing.

This runbook does not change the current Windows property-database setup.

## Architecture Summary

- Worker: `infra/gateway-proxy/`
- D1 database: `gpc-gateway-cache`
- sync producer: `infra/gateway-proxy/scripts/sync-to-d1.py`
- expected cadence: every 15 minutes from the Windows host
- source header on responses: `X-GPC-Source: gateway | d1-cache | d1-stale`

## Symptoms

- parcel searches still work but repeatedly return cached/stale data
- worker responses shift from `gateway` to `d1-cache` or `d1-stale`
- sync-status visibility is unavailable because admin routes are not yet deployed

## Immediate Checks

1. Probe the worker and inspect source headers.

```bash
curl -i "https://gateway.gallagherpropco.com/parcels/search?q=<query>&limit=1"
```

2. Check whether the live worker is still reaching the origin:

```bash
curl -i "https://gateway.gallagherpropco.com/health"
```

3. SSH to the Windows host:

```bash
ssh bg
```

4. Verify the local gateway:

```bash
curl -i "http://localhost:8000/health"
```

## Diagnosis Matrix

### Case A — Worker healthy, source header stays `gateway`

Interpretation:

- D1 sync is not the active problem

Action:

- investigate the origin or caller-specific issue instead

### Case B — Worker healthy, source header is `d1-cache`

Interpretation:

- origin may be intermittently unavailable or the worker is intentionally serving cache

Action:

- verify the Windows host can still reach the property gateway locally
- inspect the scheduled sync job and the last successful sync timestamp

### Case C — Worker healthy, source header is `d1-stale`

Interpretation:

- cached data exists, but refresh is failing or lagging materially

Action:

- treat as a sync incident
- capture the last successful sync time
- verify the Windows-side sync producer and any credentials it depends on

## Recovery Steps

1. Confirm the Windows gateway is healthy.
2. Confirm the sync producer process/job is still running from the Windows host.
3. Re-run or restart the sync producer if it is stuck.
4. Re-check public responses until `X-GPC-Source: gateway` or fresh `d1-cache` resumes.

## Current Operational Limitation

Because production admin routes are not yet deployed, there is no complete live `/admin/sync/status` path for remote operators today. Until that deployment gap is closed:

- use `X-GPC-Source` headers as the public symptom signal
- use `ssh bg` and local inspection for authoritative diagnosis

## Evidence To Capture

- public response headers showing `X-GPC-Source`
- local `http://localhost:8000/health` output
- sync producer logs or scheduler state from the Windows host
- whether admin sync-status endpoints are available yet
