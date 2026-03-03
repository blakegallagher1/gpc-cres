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
| Entitlement DB | `db.gallagherpropco.com` | Blake@gallagherpropco.com | 24h |

Configure in: Zero Trust → Access → Applications → Add application.
Free plan: 500 applications, 50 identity providers.

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
psql postgresql://postgres:postgres@localhost:54399/entitlement_os -f ~/supabase_dump_app.sql

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
| `docs/SERVER_MANAGEMENT.md` | SSH setup, cloudflared on Mac, `pnpm server:*` scripts |
| `infra/local-api/CLOUDFLARE_TUNNEL_SETUP.md` | Generic tunnel creation guide (reference) |
