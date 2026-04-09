# Auth Chain Diagnostics

Last reviewed: 2026-04-09

## Purpose

Diagnose production auth failures across the full chain without changing the current Windows-host database deployment.

## Canonical Chain

Google OAuth -> Vercel sign-in callback -> Prisma -> Cloudflare Hyperdrive (`ebd13ab7df60414d9ba8244299467e5e`) -> gateway proxy `/db` endpoint -> PostgreSQL on Windows

## Known Single Point Of Failure

If Docker Desktop or the Windows-host gateway path is down, `/health` can still be green while `/db` is dead. Treat auth failures as `/db` path failures until disproven.

## Trigger Symptoms

- `auth_unavailable`
- `auth_db_unreachable`
- login succeeds at Google but app session creation fails
- production health looks partially green but all authenticated pages fail

## Triage Order

1. Confirm the user-visible symptom in production.
2. SSH to the Windows host via Tailscale:

```bash
ssh bg
```

3. Check Docker Desktop / container reachability.

```bash
docker ps
```

4. Verify the gateway health endpoint:

```bash
curl -i "http://localhost:8000/health"
```

5. Verify the DB proxy endpoint specifically:

```bash
curl -i "http://localhost:8000/db"
```

## Diagnosis Matrix

### Case A — `/health` OK, `/db` fails

Interpretation:

- this is the canonical masked outage
- auth chain is broken even though top-level health looks fine

Action:

- treat as P0 auth outage
- recover Docker Desktop / gateway / DB path first

### Case B — `docker ps` fails or returns no containers

Interpretation:

- Docker Desktop likely crashed

Action:

- follow `docs/memory/docker-desktop-recovery-2026-03-31.md`

### Case C — local `/db` works, production auth still fails

Interpretation:

- investigate Hyperdrive or Cloudflare worker path next

Action:

- confirm Hyperdrive binding/config has not drifted
- confirm the CF `/db` worker path is still reachable from Vercel

### Case D — local `/db` and production auth both fail after deploy

Interpretation:

- likely gateway/container regression rather than edge-only drift

Action:

- inspect gateway logs and the deployed gateway revision

## Evidence To Capture

- exact auth error seen by the user
- `docker ps`
- local `curl http://localhost:8000/health`
- local `curl http://localhost:8000/db`
- whether Docker Desktop recovery was required

## Related Docs

- `CLAUDE.md`
- `docs/memory/docker-desktop-recovery-2026-03-31.md`
- `docs/runbooks/ADMIN_ROUTE_DEPLOYMENT.md`
- `docs/runbooks/D1_SYNC_FAILURE_RUNBOOK.md`
