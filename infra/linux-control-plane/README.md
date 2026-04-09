# Linux Control Plane

This directory contains the deployment assets for the Linux-hosted public control plane.

## Intent

Move these public/runtime services off the Windows PC:

- FastAPI gateway
- admin API surface
- CUA worker

Keep these on the Windows PC:

- property data
- knowledge base backing services
- any deferred Windows-local datasets

## Prerequisites

1. Linux host provisioned
2. Tailscale installed and joined to the same tailnet
3. Windows host reachable at `100.67.140.126`
4. Required env vars populated from `.env.example`

## Deploy

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

## Verify

```bash
curl -fsS http://localhost:8000/health
curl -fsS http://localhost:3001/health
```

Then run:

```bash
../../scripts/control-plane/preflight-linux.sh
../../scripts/control-plane/verify-cutover.sh
```

## Notes

- `WINDOWS_PROPERTY_DB_URL`, `WINDOWS_APP_DB_URL`, `WINDOWS_MARTIN_URL`, and `WINDOWS_QDRANT_URL` are intentionally Windows-backed.
- This is a control-plane extraction, not a data-plane migration.
