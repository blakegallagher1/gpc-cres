# CUA Worker Recovery

Last reviewed: 2026-04-09

## Purpose

Recover the browser automation worker (`gpc-cua-worker`) and isolate whether failures are in:

- the CUA worker container
- the FastAPI gateway proxy layer
- the Cloudflare tunnel path
- first-party auth/bootstrap inside the worker

This runbook preserves the current Windows-host deployment model.

## Public Contract

- public hostname: `https://cua.gallagherpropco.com`
- proxied health: `GET /cua/health`
- task entrypoint: `POST /tasks`
- path: Vercel/app -> Cloudflare tunnel -> `gateway:8000` -> explicit CUA proxy handlers -> `cua-worker:3001`

## Symptoms

- `browser_task` reports service unavailable
- `POST /tasks` returns `404`, `502`, `503`, or `504`
- chat falls back to `public_web` after a browser-task outage
- `BrowserSessionCard` never receives live screenshots

## First Checks

1. Verify the public health path.

```bash
curl -i "https://cua.gallagherpropco.com/cua/health"
```

2. Verify the gateway itself.

```bash
curl -i "https://cua.gallagherpropco.com/health"
```

3. SSH through Tailscale.

```bash
ssh bg
```

4. Check relevant containers.

```bash
docker ps --format "{{.Names}} {{.Status}}" | rg "gpc-cua-worker|gateway|cloudflared"
```

5. Check local health from the Windows host.

```bash
curl -i "http://localhost:8000/cua/health"
curl -i "http://localhost:8000/health"
docker logs gpc-cua-worker --tail 200
```

## Diagnosis Matrix

### Case A — `/cua/health` fails locally

Interpretation:

- the worker container is down, crashed, or unreachable from the gateway

Action:

```bash
cd C:/gpc-cres-backend
docker compose up -d gpc-cua-worker
docker logs gpc-cua-worker --tail 200
```

If startup fails because Docker Desktop itself is down, follow `docs/memory/docker-desktop-recovery-2026-03-31.md`.

### Case B — Local `/cua/health` passes but public `POST /tasks` returns 404

Interpretation:

- gateway/tunnel drift rather than worker failure
- most likely duplicate Cloudflare tunnel connectors or a stale gateway bundle

Action:

- confirm only one production `cloudflared-tunnel` connector is active
- remove stale Mac-side connector if present
- verify the current gateway bundle includes the explicit CUA proxy handlers

### Case C — Worker healthy, task creation fails with auth errors

Interpretation:

- the caller and worker disagree on bearer auth or first-party auth bootstrap

Action:

- confirm `API_KEY` in the worker matches the caller expectation
- confirm first-party runtime secrets exist if the task targets authenticated `gallagherpropco.com` routes

### Case D — Worker healthy, task starts, then times out or returns oversized-output errors

Interpretation:

- this is an application/runtime behavior issue inside the Responses loop, not an infra outage

Action:

- inspect worker logs for `computer_call_output` or oversized replay failures
- compare against `infra/cua-worker/src/responses-loop.ts`
- verify recent browser-task changes with the local worker tests before redeploying

## Recovery Procedure

1. Restore container health locally.
2. Re-check `http://localhost:8000/cua/health`.
3. Re-check `https://cua.gallagherpropco.com/cua/health`.
4. Run a minimal task through the public endpoint.
5. Confirm chat/browser_task no longer falls back with service-unavailable errors.

## Evidence To Capture

- public and local health responses
- `docker ps` output for `gpc-cua-worker`, `gateway`, `cloudflared`
- `docker logs gpc-cua-worker --tail 200`
- whether the failure is `404` (routing drift) vs `5xx` (runtime/container)

## Related Docs

- `infra/cua-worker/DEPLOY.md`
- `docs/claude/architecture.md`
- `docs/memory/docker-desktop-recovery-2026-03-31.md`
