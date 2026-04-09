# Screening Incident Runbook

Last reviewed: 2026-04-09

## Purpose

Triage and recover parcel screening failures without changing the current Windows PC database topology.

This runbook exists because production previously had a route-contract drift condition between the Cloudflare worker and the Windows gateway. That specific drift was fixed on 2026-04-09 by updating the worker to target `/api/screening/*` with `parcelId`.

Use this runbook for any future screening incident, but do not assume the old `/tools/screen.*` mismatch is still the cause.

## Symptoms

- `GET https://gateway.gallagherpropco.com/screening/<type>/<parcelId>` returns `5xx`
- deal screening or parcel screening in the app fails while non-screening parcel lookups still work
- the Cloudflare worker route matches, but upstream screening fails

## What This Runbook Does Not Do

- It does not move property data off the Windows server
- It does not alter the current property-DB access model
- It does not hot-patch screening SQL directly in production without source changes

## Fast Triage

1. Confirm the public symptom.

```bash
curl -i "https://gateway.gallagherpropco.com/screening/flood/<parcelId>"
```

2. Confirm the edge worker itself is healthy.

```bash
curl -i "https://gateway.gallagherpropco.com/health"
```

3. SSH to the Windows host through Tailscale only.

```bash
ssh bg
```

4. Verify the local gateway is up.

```bash
curl -i "http://localhost:8000/health"
```

5. Record whether the deployed gateway still exposes legacy screen handlers or the repo's `/api/screening/*` handlers.

Recommended evidence:

- local `openapi.json`
- local gateway container image/tag or rebuild timestamp
- `docker logs gateway --tail 200`

## Diagnosis Matrix

### Case A — Gateway healthy, screening endpoints 500

Interpretation:

- proxy routing may be working
- screening failure is now likely inside the gateway handler/runtime, auth, or dataset query path

Action:

- treat as a gateway-runtime or auth incident, not an automatic route-shape mismatch
- do not change the Windows DB usage model
- validate the exact failing handler locally with authenticated container-local probes

### Case B — Gateway unhealthy

Interpretation:

- screening failure is downstream of the wider Windows-host or Docker failure

Action:

- follow `docs/memory/docker-desktop-recovery-2026-03-31.md` if Docker Desktop is down
- re-run local health checks before re-testing screening

### Case C — Public route 404, local gateway has CUA/admin/screening routes

Interpretation:

- likely tunnel connector drift or stale deployed gateway bundle

Action:

- verify only one `cloudflared-tunnel` connector is active for the production tunnel
- remove stale Mac-side connector if present

## Recovery Path

If local source is correct and production is stale:

1. Verify source of truth in repo:
   - `infra/local-api/main.py`
   - screening implementation modules referenced from that gateway
2. Deploy the gateway container from the Windows host through `ssh bg`
3. Re-test:

```bash
curl -i "https://gateway.gallagherpropco.com/screening/flood/<parcelId>"
curl -i "https://gateway.gallagherpropco.com/screening/wetlands/<parcelId>"
```

4. Validate app-level screening routes again from the web app

## Evidence To Capture

- failing public `curl` output
- local `http://localhost:8000/health` output
- gateway logs around the failed parcel ID
- whether the deployed gateway still uses `/tools/screen.*`
- whether the repo version with `/api/screening/*` has been deployed

## Verification Reference

On 2026-04-09, container-local verification on `fastapi-gateway` returned `200` for:

- `POST http://localhost:8000/api/screening/flood` with body `{ "parcelId": "4245003" }`
