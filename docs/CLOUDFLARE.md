# Cloudflare Setup — Entitlement OS

Single source of truth for the Cloudflare configuration. **Ingress rules are managed in the Cloudflare dashboard, not in local config files.**

---

## Tunnel

| Property | Value |
|----------|-------|
| Name | `gpc-hp-tunnel` |
| ID | `9f7fb0d6-ecb1-4b98-b523-9a60013187b7` |
| Connector | `cloudflared` in Docker Compose on Windows 11 |
| Auth | `CLOUDFLARE_TUNNEL_TOKEN` (or `TUNNEL_TOKEN`) env var |
| Dashboard | [Tunnels](https://dash.cloudflare.com/55b17d447da0e5149495a35177e7ae79/tunnels) → gpc-hp-tunnel |

---

## Ingress Rules (Public Hostnames)

All routes go through the single tunnel. Configure in: Tunnels → gpc-hp-tunnel → Configure → Public Hostname.

| Subdomain | Domain | Service Type | URL | Purpose |
|-----------|--------|--------------|-----|---------|
| `api` | gallagherpropco.com | HTTP | localhost:8000 | FastAPI gateway (deals, parcels, screening, storage) |
| `tiles` | gallagherpropco.com | HTTP | localhost:3000 | Martin MVT tiles |
| `ssh` | gallagherpropco.com | SSH | host.docker.internal:22 | Remote SSH to Windows PC |
| `db` | gallagherpropco.com | TCP | entitlement-db:5432 | PostgreSQL (Cloudflare Access protected) |
| `codex` | gallagherpropco.com | HTTP | localhost:8765 | Codex app-server (WebSocket) |
| `codex-mcp` | gallagherpropco.com | HTTP | localhost:8787 | Codex MCP controller (ChatGPT) |
| `agents` | gallagherpropco.com | — | Cloudflare Worker | Agent WebSocket chat (NOT a tunnel route — CF Worker route) |

**Public URLs:**
- `https://api.gallagherpropco.com` — gateway (Bearer auth)
- `https://tiles.gallagherpropco.com` — map tiles
- `https://agents.gallagherpropco.com` — WebSocket agent chat (Cloudflare Worker, not tunnel)
- `ssh.gallagherpropco.com` — SSH (via `cloudflared access ssh`)
- `db.gallagherpropco.com` — PostgreSQL (via `cloudflared access tcp`, Access-gated)
- `wss://codex.gallagherpropco.com` — Codex app-server WebSocket
- `https://codex-mcp.gallagherpropco.com` — Codex MCP controller (ChatGPT)

---

## DNS

If tunnel uses CNAME routing, subdomains may auto-resolve. Otherwise add CNAME records:

| Name | Type | Target | Proxy |
|------|------|--------|-------|
| api | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| tiles | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| ssh | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| db | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| codex | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| codex-mcp | CNAME | 9f7fb0d6-ecb1-4b98-b523-9a60013187b7.cfargotunnel.com | Proxied |
| agents | CNAME | entitlement-os-agent.gallagherpropco.workers.dev | Proxied |

---

## Cloudflare Access (Zero Trust)

Protects services with browser login before reaching the backend.

### Applications

| Application | Domain | Policy | Session |
|-------------|--------|--------|---------|
| SSH | `ssh.gallagherpropco.com` | Blake@gallagherpropco.com | 24h |
| Entitlement DB | `db.gallagherpropco.com` | Blake@gallagherpropco.com (Allow) + `hyperdrive-db` service token (Service Auth) | 24h |
| API Gateway | `api.gallagherpropco.com` | `api-gallagherpropco-service-auth` (Service Auth token) | token-based |

Configure in: Zero Trust → Access → Applications → Add application.
Free plan: 500 applications, 50 identity providers.

### API Gateway Trusted Caller Contract

Requests to `api.gallagherpropco.com` from backend trusted callers must include all three:

- `Authorization: Bearer <LOCAL_API_KEY>`
- `CF-Access-Client-Id: <CF_ACCESS_CLIENT_ID>`
- `CF-Access-Client-Secret: <CF_ACCESS_CLIENT_SECRET>`

Without the two Access headers, Cloudflare blocks at edge (`403`) before origin is reached.

### Edge Smoke Matrix (Proven Behavior)

Run:

```bash
pnpm smoke:gateway:edge-access
```

Script: `scripts/smoke_gateway_edge_access.ts`

The script validates **both modes** for downstream paths that back the app routes:

- Deals: `/deals`, `/deals/{id}`
- Parcels / Places: `/api/parcels/search`, `/tools/parcels.search`
- Map + SQL paths: `/tools/parcels.sql`, `/tiles/{z}/{x}/{y}.pbf`
- Geometry: `/api/parcels/{id}/geometry`
- Tool/screening: `/tools/parcel.lookup`, `/tools/parcels.sql`, `/api/screening/{flood,soils,wetlands,epa,traffic,ldeq,full}`
- Semantic/Qdrant: validated through app routes, not direct gateway endpoints (currently `/api/knowledge` read path and `/api/memory/write` write path)
- Hyperdrive DB proxy: `POST /db`
- Policy check: `/admin/health`, `/health`

Expected status behavior:

- `without_access`: every endpoint returns Cloudflare Access block (`403` with Access block signature).
- `with_access`: every endpoint reaches origin (status is **not** Cloudflare block; may be `200/400/401/403/404/422` based on origin auth/business rules). The assertion is edge pass-through, not a fixed origin status code. The gateway/Hyperdrive combo is the only exposed path to Postgres; any request that is not Access-authorized must fail closed at the edge.
- `/admin/health` is expected to remain origin-`403` for this service token flow unless `ADMIN_API_KEY` policy is used.

### Token Rotation Runbook (Quarterly)

Run this every quarter (or immediately after any suspected exposure):

1. Create a new Cloudflare Access service token in the `api-gallagherpropco-service-auth` policy.
2. Update secrets in all runtimes:
   - Vercel: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`
   - Worker: same keys (`wrangler secret put`)
   - local `.env` and `apps/web/.env.local` for ops smoke runs
3. Redeploy affected services (Vercel + Worker).
4. Run `pnpm smoke:gateway:edge-access` and confirm matrix pass.
5. Revoke the old token in Cloudflare Access.
6. Record rotation date, operator, and smoke result in ops notes.

### Blast Radius Reduction

Current policy allows broad service-token access to `api.gallagherpropco.com`.
If narrower scope is required, split into path-limited Access applications/policies (for example `/tools/*` and `/api/screening/*`) and issue separate tokens per caller class.

---

## Hyperdrive (Database Gateway for Vercel)

Cloudflare Hyperdrive provides connection pooling and caching between Vercel serverless functions and the local PostgreSQL database through the Cloudflare tunnel.

| Property | Value |
|----------|-------|
| Config ID | `ebd13ab7df60414d9ba8244299467e5e` |
| Host | `db.gallagherpropco.com` (tunnel TCP) |
| Database | `entitlement_os` |
| Worker binding | `HYPERDRIVE` in `infra/cloudflare-agent/wrangler.toml` |
| Access policy | Service Auth via `hyperdrive-db` service token |

**How it works:**
1. Vercel sends Prisma SQL via HTTPS POST to `agents.gallagherpropco.com/db`
   (control-plane/tooling path only; not used as fallback for authoritative parcel/property/deals runtime flows)
2. CF Worker uses Hyperdrive binding to get a pooled Postgres connection
3. Hyperdrive connects through the tunnel to `db.gallagherpropco.com` (TCP)
4. The tunnel routes to `entitlement-os-postgres:5432` on the Docker network
5. Results return through the same chain

**Prisma integration:** `packages/db/src/gateway-adapter.ts` implements `SqlDriverAdapterFactory` — activates when `GATEWAY_DATABASE_URL` + `LOCAL_API_KEY` are both set on Vercel.

**SSL:** Self-signed cert enabled on Postgres (required by Hyperdrive). 10-year expiry, auto-generated in container.

**Management:**
```bash
npx wrangler hyperdrive list              # List configs
npx wrangler hyperdrive get entitlement-os-db  # Check status
```

---

## Remote Database Access (from Mac)

The `db.gallagherpropco.com` route exposes PostgreSQL through the tunnel, protected by Cloudflare Access (email-gated to Blake only). No need to be near the PC.

**Connect:**

```bash
# Terminal 1 — start the proxy (leave running)
cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399

# Terminal 2 — connect via psql
psql postgresql://postgres:postgres@localhost:54399/entitlement_os
```

First connection may open a browser for Access authentication (24h session).

**Common operations:**

```bash
# Interactive shell
psql postgresql://postgres:postgres@localhost:54399/entitlement_os

# Restore a dump (full Step 2: docs/MIGRATION_REMAINING_PLAN.md)
psql postgresql://postgres:postgres@localhost:54399/entitlement_os -f ~/entitlement_os_dump.sql

# Quick query
psql postgresql://postgres:postgres@localhost:54399/entitlement_os -c "SELECT count(*) FROM deals;"
```

**Shell alias (optional):**

```bash
echo 'alias dbproxy="cloudflared access tcp --hostname db.gallagherpropco.com --url localhost:54399"' >> ~/.zshrc
source ~/.zshrc
# Then just: dbproxy
```

---

## Plan

**Free plan** — sufficient for this setup. Upgrade only for higher limits or advanced Zero Trust features.

---

## Related Docs

For generic tunnel creation, see `infra/local-api/CLOUDFLARE_TUNNEL_SETUP.md`. For legacy two-tunnel layout, see `infra/cloudflared/README.md`.

| Doc | Purpose |
|-----|---------|
| `docs/CLOUDFLARE_AGENTS.md` | Worker + Durable Object architecture, deployment, env vars |
| `docs/claude/backend.md` | Gateway endpoints, auth, Vercel integration |
| `docs/SERVER_MANAGEMENT.md` | SSH setup, cloudflared on Mac, admin endpoint + smoke command workflow |
| `infra/local-api/CLOUDFLARE_TUNNEL_SETUP.md` | Generic tunnel creation guide (reference) |
