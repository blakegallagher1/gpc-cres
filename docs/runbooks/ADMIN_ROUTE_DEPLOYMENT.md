# Admin Route Deployment

Last reviewed: 2026-04-09

## Purpose

Deploy the repo's `infra/local-api/admin_router.py` and mounted `/admin/*` routes to the production gateway.

This is a deployment/runbook gap, not a database-topology change.

## Current State

- `infra/local-api/main.py` mounts `admin_router` locally
- admin routes were verified live on the Windows gateway container on 2026-04-09
- canonical verified runtime check:
  - `GET http://localhost:8000/admin/health` with `ADMIN_API_KEY` returned `200`
- public unauthenticated probes may still hit Cloudflare challenge pages before origin auth

This runbook remains the canonical procedure for future admin-router redeploys or verification after gateway rebuilds.

## Prerequisites

- use Tailscale SSH only: `ssh bg`
- do not use deprecated Cloudflare SSH paths
- `ADMIN_API_KEY` remains the application auth token for `/admin/*`
- Cloudflare Access headers are still required at the edge where applicable

## Verify The Gap First

From an operator machine with the correct auth headers, probe one of the live admin routes:

```bash
curl -i "https://api.gallagherpropco.com/admin/health/history"
curl -i "https://gateway.gallagherpropco.com/admin/sync/status"
```

If the live route is missing or stale while the repo source mounts `admin_router`, continue with deployment.

## Source Of Truth

- `infra/local-api/main.py`
- `infra/local-api/admin_router.py`

## Deployment Procedure

1. SSH to the Windows host:

```bash
ssh bg
```

2. Move to the backend root:

```bash
cd C:/gpc-cres-backend
```

3. Rebuild and restart the gateway container:

```bash
docker compose up -d --build gateway
```

4. If Docker Desktop credential helpers break the build with:

`A specified logon session does not exist`

use the documented workaround from `docs/SERVER_MANAGEMENT.md`:

- temporarily rename:
  - `docker-credential-desktop.exe`
  - `docker-credential-wincred.exe`
- rerun:

```bash
docker compose up -d --build gateway
```

- restore both credential-helper binaries afterward

## Post-Deploy Validation

1. Validate gateway health:

```bash
curl -i "http://localhost:8000/health"
```

2. Validate the mounted admin route locally first, then publicly:

```bash
curl -i "http://localhost:8000/admin/health/history"
curl -i "https://api.gallagherpropco.com/admin/health/history"
```

3. Confirm at least one live admin endpoint now responds from the deployed gateway:

- `/admin/health/history`
- `/admin/sync/status`
- `/admin/deploys/report`

## Rollback

If the rebuilt gateway fails health checks:

1. capture `docker logs gateway --tail 200`
2. restore the last known-good gateway image/container revision
3. keep the admin routes flagged as not deployed until the next verified rebuild

## Evidence To Capture

- pre-deploy and post-deploy `curl` outputs
- `docker compose up -d --build gateway` output
- `docker logs gateway --tail 200`
- the exact commit/revision deployed
