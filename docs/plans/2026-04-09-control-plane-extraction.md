# Control Plane Extraction

Date: 2026-04-09
Status: In Progress
Owner: Platform engineering
Priority: P0

## Objective

Move the public control plane off the Windows PC while keeping the Windows PC as the data plane for:

- property data
- knowledge base storage and retrieval
- any current Windows-local datasets or jobs not explicitly migrated

This plan does not move production data to the MacBook.

## Why This Is The Highest-Leverage Infrastructure Change

The Windows Docker Desktop host is still the largest shared failure domain in the system. It currently sits underneath or directly impacts:

- auth
- public gateway traffic
- admin runtime access
- browser automation
- screening
- deploy reporting
- incident response visibility

As long as those public/runtime responsibilities remain on Windows, every product feature depends on the same host-level SPOF. Extracting the control plane creates outsized impact without forcing a high-risk property-data or knowledge-base migration.

## Scope

### In Scope

- rehost public gateway runtime on Linux
- rehost public admin surface on Linux
- rehost CUA worker on Linux
- rewire public Cloudflare origins to Linux-hosted control-plane services
- add dependency-aware health checks so `/health` cannot mask `/db` failures
- preserve Tailscale connectivity from Linux control plane to Windows data plane
- add runbooks and verification gates for cutover and rollback

### Explicitly Out Of Scope

- moving property DB off Windows
- moving Qdrant / knowledge base off Windows
- moving data storage to the MacBook
- destructive schema changes
- changing the current source-of-truth ownership of property or KB data

## Current State

### Windows PC remains the authoritative data plane

- property DB stays on Windows
- knowledge base stays on Windows
- app DB may remain on Windows for this phase unless separately approved for migration

### Public/runtime surfaces to extract

- `infra/local-api/` FastAPI gateway
- `/admin/*` surface currently mounted by `infra/local-api/admin_router.py`
- `infra/cua-worker/`
- public health and control-plane diagnostics

### Current public/runtime risk pattern

- Docker Desktop outage can break auth, gateway, and CUA together
- `/health` can look healthy while `/db` is dead
- Cloudflare edge surfaces currently route to services coupled to the Windows host runtime

## Current Execution State

Completed in repo:

- roadmap and docs registration completed
- Linux control-plane deployment assets created under `infra/linux-control-plane/`
- Linux preflight and cutover verification scripts created under `scripts/control-plane/`
- health contract upgraded to include dependency-level control-plane readiness

Completed on Linux host `root@5.161.99.123`:

- Docker installed
- Docker Compose installed
- Tailscale package installed
- deployment files staged under `/opt/gpc-control-plane`

Current live blocker:

- the Linux host is not yet joined to the tailnet (`tailscale status` -> `NeedsLogin`)
- no Tailscale auth key is present in the current environment, so the host cannot yet reach the Windows data plane

## Target Architecture

### Linux control plane

- Linux-hosted FastAPI gateway
- Linux-hosted admin API
- Linux-hosted CUA worker
- Linux-hosted control-plane health checks and probes
- Cloudflare public HTTP routes terminate on Linux first

### Windows data plane

- property DB
- knowledge base / vector retrieval backing stores
- any Windows-only internal services still required by control-plane requests

### Network boundary

- Linux control plane reaches Windows data plane through Tailscale
- public traffic does not depend on Windows Docker Desktop for gateway/CUA process availability

## Service Mapping

| Service | Current host | Target host | Notes |
|---|---|---|---|
| FastAPI gateway (`infra/local-api`) | Windows | Linux | Public control plane |
| Admin router (`/admin/*`) | Windows | Linux | Ships with gateway |
| CUA worker (`infra/cua-worker`) | Windows | Linux | Public control plane |
| Cloudflare worker `gateway.gallagherpropco.com` | Cloudflare | Cloudflare | Keep, but point to Linux gateway contract |
| Property DB | Windows | Windows | Must stay |
| Knowledge base / retrieval backing stores | Windows | Windows | Must stay |
| Martin / tiles | Windows | Deferred | Keep on Windows for this phase unless a separate latency decision is made |

## Required Repo Changes

### Planning / docs

- `ROADMAP.md`
- `docs/plans/INDEX.md`
- `docs/INDEX.md`
- `docs/CHANGELOG_DOCS.md`
- `docs/claude/architecture.md`
- new cutover runbook:
  - `docs/runbooks/LINUX_CONTROL_PLANE_CUTOVER.md`

### New deployment assets

- `infra/linux-control-plane/docker-compose.yml`
- `infra/linux-control-plane/.env.example`
- `infra/linux-control-plane/README.md`
- optional helper scripts:
  - `scripts/control-plane/preflight-linux.sh`
  - `scripts/control-plane/verify-cutover.sh`

### Gateway hardening

- `infra/local-api/main.py`
- related health or runtime probes under:
  - `apps/web/app/api/health/`
  - `apps/web/app/api/health/detailed/`
  - `scripts/observability/`

### CUA deployment/runtime

- `infra/cua-worker/DEPLOY.md`
- `docs/runbooks/CUA_WORKER_RECOVERY.md`

## Delivery Phases

### Phase 0 — Design Freeze And Host Provisioning

#### Work

- add this plan to roadmap and docs indexes
- provision Linux host
- install Docker / runtime prerequisites
- join Linux host to Tailscale
- prove Linux can reach the Windows host over Tailscale

#### Acceptance

- Linux host can reach:
  - Windows gateway private address
  - app DB private path if needed
  - Windows-hosted KB dependencies
- operator docs updated with host roles

#### Rollback

- none; no public cutover yet

### Phase 1 — Linux Gateway Shadow Deploy

#### Work

- create Linux deployment assets in `infra/linux-control-plane/`
- deploy `infra/local-api` on Linux
- configure Linux gateway env to reach Windows-backed dependencies via Tailscale
- keep Cloudflare public origin unchanged

#### Validation

- Linux gateway local health passes
- Linux gateway can proxy:
  - `/db`
  - `/api/screening/*`
  - property SQL path
  - admin routes

#### Acceptance

- all required gateway routes pass against Linux directly
- no public traffic moved yet

#### Rollback

```bash
docker compose -f /opt/gpc-control-plane/docker-compose.yml down
```

### Phase 2 — Health Contract Hardening

#### Work

- make gateway health dependency-aware
- split:
  - process health
  - app DB path health
  - property-data path health
  - KB dependency health
  - CUA health
- ensure `/health` cannot claim success when critical dependencies are dead

#### Validation

- dependency failure simulations show degraded/failed health correctly
- sentinel/probes alert on dependency loss

#### Acceptance

- masked-health failure mode eliminated for control-plane dependencies

#### Rollback

- revert health contract changes and restore previous route behavior if they block cutover

### Phase 3 — Linux CUA Shadow Deploy

#### Work

- deploy `infra/cua-worker` on Linux
- wire Linux gateway to Linux CUA worker
- preserve existing external task contract

#### Validation

- `/cua/health` passes on Linux
- sample task completes
- first-party bootstrap still works

#### Acceptance

- Linux CUA path is production-ready in shadow mode

#### Rollback

```bash
docker compose -f /opt/gpc-control-plane/docker-compose.yml stop cua-worker
```

or point Linux gateway back to the Windows CUA worker temporarily.

### Phase 4 — Public Gateway Cutover

#### Work

- update Cloudflare public origin for gateway-facing HTTP routes to Linux
- preserve Windows as private data plane

#### Validation

- public `api.gallagherpropco.com` health passes
- auth callback works
- admin route works
- screening works

#### Acceptance

- public gateway traffic no longer depends on Windows Docker Desktop process uptime

#### Rollback

- restore Cloudflare origin/tunnel target to the previous Windows gateway target

### Phase 5 — Public CUA Cutover

#### Work

- update `cua.gallagherpropco.com` origin to Linux-hosted gateway/CUA path

#### Validation

- `browser_task` works through public path
- screenshots/events stream correctly

#### Acceptance

- public CUA no longer depends on Windows Docker Desktop process uptime

#### Rollback

- restore previous public CUA origin

### Phase 6 — Stabilization And Windows Role Reduction

#### Work

- remove Windows from public-path assumptions in docs and runbooks
- keep only the data-plane responsibilities on Windows
- update preflight and incident runbooks

#### Acceptance

- docs consistently describe Linux as control plane and Windows as data plane
- release verification and incident runbooks use the new topology

## Verification Gates

### Repo gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Infra gates

- Linux host can reach Windows via Tailscale
- Linux gateway can reach Windows-backed dependencies
- public auth flow passes after cutover
- public admin route passes after cutover
- public screening route passes after cutover
- public CUA health and sample task pass after cutover

### Required proof artifacts

- deployed control-plane compose file and env template
- cutover verification log
- post-cutover health snapshots
- rollback commands tested at least once in shadow/pre-cutover mode

## Rollback Summary

### Public gateway rollback

1. Restore Cloudflare origin to previous Windows route
2. Verify public `/health`
3. Verify auth callback

### Public CUA rollback

1. Restore `cua.gallagherpropco.com` origin to previous route
2. Verify `/cua/health`
3. Verify sample `browser_task`

### Linux stack rollback

```bash
docker compose -f /opt/gpc-control-plane/docker-compose.yml down
```

## Non-Goals

- no move of property data to your MacBook
- no move of KB to your MacBook
- no forced migration of data-plane stores in this phase
- no broad architecture rewrite beyond control-plane extraction

## Final Success Condition

The project succeeds when:

- public gateway and public CUA no longer depend on Windows Docker Desktop runtime uptime
- property data and knowledge base remain on the Windows PC
- operators can still use Tailscale to reach the Windows data plane
- public incidents become control-plane incidents, not host-wide total outages
