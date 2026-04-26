# Windows PC Server Management

Manage the Windows PC backend (BG) from your MacBook.

> **DEPRECATED (2026-03-31):** The Cloudflare Tunnel SSH path (`ssh.gallagherpropco.com`) documented below is deprecated and unreliable. **Use Tailscale instead: `ssh bg "command"`**. See CLAUDE.md "Infrastructure Access" section. The Cloudflare references below are preserved for historical context only.

---

## Server Details (BG)

| Field | Value |
|-------|-------|
| Hostname | BG |
| OS | Windows 11 (build **22631** reported on host — verify with `winver` if this drifts) |
| SSH User | `cres_admin` |
| SSH Server | OpenSSH_for_Windows_8.6 |
| Auth Method | SSH key (ed25519) + password fallback |
| Project Path | `C:\gpc-cres-backend\` |
| DB Password | `postgres` (set at container init, not the `.env` value) |

### Docker Services

All services use a single PostgreSQL database (`entitlement_os`). The legacy `local-postgis` container (`db` service) is stopped — its data was consolidated into the current Postgres service on 2026-02-24.

**Name drift:** Docker Compose **service** names (e.g. `entitlement-db`) and **`docker ps` container** names (e.g. `entitlement-os-postgres`) may differ; they refer to the same database. Confirm with `docker compose ps` / `docker ps` on BG. Canonical structured summary: `docs/server-manifest.json`.

| Name (typical) | Service | Port |
|-----------|---------|------|
| Postgres (see naming note above) | PostgreSQL (all data) | 5432 (internal) / 54323 (localhost) |
| fastapi-gateway | FastAPI API | 8000 |
| martin-tile-server | Vector tiles | 3000 |
| qdrant | Vector search | 6333 |
| cloudflared | Tunnel | — |
| pgadmin | DB admin UI | 5050 |
| codex-server | Codex app-server + MCP | 8765, 8787 |

---

## MacBook Setup

**1. Install cloudflared**

```bash
brew install cloudflared
```

**2. Configure SSH**

Add to `~/.ssh/config`:

```
# DEPRECATED — use `ssh bg` via Tailscale instead
Host ssh.gallagherpropco.com
  ProxyCommand cloudflared access ssh --hostname %h
  User cres_admin
```

**3. Connect**

```bash
# DEPRECATED — use `ssh bg` via Tailscale instead
ssh ssh.gallagherpropco.com
```

If Cloudflare Access is enabled, you’ll see a browser login first. Then SSH proceeds.

## Operator Shell Env (optional)

Export these once in your shell before running admin and smoke commands:

```bash
export CF_ACCESS_CLIENT_ID="<service-token-id>"
export CF_ACCESS_CLIENT_SECRET="<service-token-secret>"
export LOCAL_API_KEY="<gateway-bearer>"
export ADMIN_API_KEY="<gateway-admin-bearer>"
```

These variables are consumed by the `curl` examples below and by edge-access smoke tooling.

---

## Windows PC Setup

Enable OpenSSH Server (PowerShell as Administrator):

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

---

## Architecture

```
MacBook (anywhere)                    Windows PC (BG)
     │                                      │
     │  ssh cres_admin@ssh.gallagherpropco.com
     │  cloudflared access tcp (db)         │
     │         │                            │
     │         ▼                            │
     │  Cloudflare Edge                     │
     │  (Access: Blake@gallagherpropco.com) │
     │         │                            │
     │         ▼                            │
     │  gpc-hp-tunnel ─────────────────────►│  OpenSSH :22
     │                                      │  entitlement-db :5432
     │                                      │  gateway :8000
     │                                      │  martin :3000
     │                                      │  codex-server :8765 / :8787
     │                                      │
```

---

## Available Commands

From repo root:

| Command | Description |
|---------|-------------|
| `pnpm smoke:gateway:edge-access` | Validate Cloudflare Access deny/pass behavior for gateway + app routes |
| `pnpm smoke:endpoints` | Run app/gateway production endpoint smoke checks |
| `pnpm parcel:smoke:prod` | Run map-parcel production smoke checks with geometry verification |
| `ssh bg` | Open SSH session to the Windows host via Tailscale (preferred) |
| `ssh ssh.gallagherpropco.com` | DEPRECATED — Open SSH session via Cloudflare Access (unreliable) |

---

## Cloudflare Account: Upgrade?

**No.** The Free plan is enough:

- Cloudflare Access: 500 applications, 50 identity providers
- Tunnel: already in use for api/tiles
- For one user managing one server, Free covers everything

Upgrade only if you need higher limits or advanced Zero Trust features.

---

## Database Topology (CRITICAL)

The Windows PC runs **two Docker Compose stacks on separate Docker networks**:

```
Network 172.18.x (Production stack — C:\gpc-cres-backend\docker-compose.yml)
├── FastAPI gateway (:8000) → connects to property DB
├── Martin tile server (:3000) → reads from property DB
├── Property DB PostgreSQL → ebr_parcels (560K multi-parish; 198,949 East Baton Rouge), fema_flood, soils, wetlands, epa_facilities
├── Qdrant (:6333)
└── Cloudflare Tunnel (cloudflared)

Network 172.19.x (Repo stack — infra/docker/docker-compose.yml)
├── App DB PostgreSQL → Prisma tables (deals, conversations, parcels, etc.)
└── Temporal services
```

### Accessing Property Data (property.parcels / ebr_parcels, screening tables)

| Method | Works? | Notes |
|--------|--------|-------|
| Gateway `/tools/parcels.sql` | **YES** | SELECT only. Table allowlist enforced. This is the primary remote path. |
| Gateway `/api/parcels/search` | **YES** | Parcel search via gateway. |
| CF DB tunnel (`db.gallagherpropco.com`) | **NO** | Connects to App DB (172.19.x). Property tables don't exist here. |
| SSH → `docker exec` | **YES** (when sshd is running) | Full DDL access. Required for materialized views, schema changes. |
| Direct LAN (192.168.1.164) | **NO** | Windows Firewall blocks all TCP ports. Only ICMP (ping) allowed. |

`ebr_parcels` is a legacy table name and now contains multiple parishes. Use
`parish` for parish-scoped parcel filters; it is indexed and avoids slow
geometry joins against overlay tables. `property.parcels` is the canonical
view/alias for new SQL contracts, with `ebr_parcels` retained for existing
queries and tile/search code.

### Accessing App Data (deals, conversations, Prisma)

| Method | Works? | Notes |
|--------|--------|-------|
| CF DB tunnel → `psql postgresql://postgres:postgres@localhost:54399/entitlement_os` | **YES** | Full read/write access. |
| Hyperdrive → CF Worker `/db` | **YES** | Used by Vercel app via Prisma. |
| SSH → `docker exec` | **YES** (when sshd is running) | |

### Running DDL on Property DB

The only way to run DDL (CREATE, ALTER, DROP) on the property DB is via SSH:

```bash
# 1. Verify SSH works (use Tailscale)
ssh bg "echo ok"

# 2. Execute SQL (use Tailscale)
cat infra/sql/my-migration.sql | ssh bg \
  'docker exec -i entitlement-os-postgres psql -U postgres -d entitlement_os'

# DEPRECATED — the old CF Access path:
# ssh cres_admin@ssh.gallagherpropco.com "echo ok"
```

If SSH is down (sshd stopped), you MUST start it from the Windows PC:
```powershell
# PowerShell as Administrator on the Windows PC
Start-Service sshd
```

---

## Troubleshooting

### SSH: "websocket: bad handshake"
- **Root cause:** OpenSSH Server (sshd) is stopped on the Windows PC
- **Fix:** Start sshd from the Windows PC: `Start-Service sshd` in PowerShell (Admin)
- **Confirm:** `Get-Service sshd` should show "Running"
- **Note:** SSH is flaky even when running. Expect intermittent `bad handshake` errors. Add 8-45s delays between SSH commands. Short commands succeed more often than piped data.

### CF DB tunnel shows no property tables
- **Root cause:** `db.gallagherpropco.com` tunnel connects to the App DB container (172.19.x network), NOT the property DB container (172.18.x network)
- **This is by design.** Property tables (`ebr_parcels`, `fema_flood`, etc.) are only in the property DB.
- **Workaround:** Use the gateway's `/tools/parcels.sql` endpoint for SELECT queries on property data.

### SSH: connection timeout
- Confirm the SSH ingress rule in the tunnel config
- Ensure `ssh.gallagherpropco.com` resolves (e.g. `nslookup ssh.gallagherpropco.com`)
- Check OpenSSH is running on Windows: `Get-Service sshd`

### Tunnel is down
- SSH or RDP into the PC
- `cd C:\gpc-cres-backend && docker compose up -d tunnel`

### Cloudflare: "cloudflared access ssh" not found
- Install cloudflared: `brew install cloudflared`
- Ensure `~/.ssh/config` has the ProxyCommand for `ssh.gallagherpropco.com`

### Docker commands fail over SSH
- Ensure Docker Desktop is running on Windows
- Use forward slashes in `SERVER_PATH` (e.g. `C:/gpc-cres-backend`)

### Gateway deployed code differs from repo
- The deployed gateway has `/tools/screen.*` endpoints (broken — return 500)
- The repo has `/api/screening/*` endpoints (correct but not deployed)
- Admin router (`/admin/*`) exists in repo but is NOT deployed
- Deploy requires SSH: `ssh bg` (Tailscale) then rebuild the gateway container. DEPRECATED: do not use `ssh cres_admin@ssh.gallagherpropco.com`

### Docker credential helper fails over SSH
When deploying via SSH, Docker Desktop's credential helper can fail (`A specified logon session does not exist`). Workaround:

1. Temporarily rename:
   - `C:\Program Files\Docker\Docker\resources\bin\docker-credential-desktop.exe` → `docker-credential-desktop.exe.bak`
   - `C:\Program Files\Docker\Docker\resources\bin\docker-credential-wincred.exe` → `docker-credential-wincred.exe.bak`
2. Run `docker compose up -d --build gateway`
3. Restore: rename both `.bak` back to `.exe`

Requires Administrator. Anonymous pulls (e.g. python:3.11-slim) work without credentials.

---

## Reference: Windows Server Layout

| Path | Purpose |
|------|---------|
| `C:\gpc-cres-backend\` | Backend root |
| `C:\gpc-cres-backend\docker-compose.yml` | Compose definition |
| `C:\gpc-cres-backend\.env` | Env vars (GATEWAY_API_KEY, B2_*, etc.) |

---

## Admin API

The gateway exposes an `/admin` API for programmatic server management — no SSH required for deploys, restarts, logs, schema inspection, or read-only queries.

**Base URL:** `https://api.gallagherpropco.com/admin`
**Auth:** `Authorization: Bearer $ADMIN_API_KEY` (separate from `GATEWAY_API_KEY` / `LOCAL_API_KEY`)
**Edge requirement:** Cloudflare Access service-token headers are also required at edge:

- `CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID`
- `CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET`

If Access headers are valid but `ADMIN_API_KEY` is not provided, `/admin/*` is expected to return origin `403`.

### Env Var

Add to `C:\gpc-cres-backend\.env`:

```
ADMIN_API_KEY=v6g5qQQ24nkD2ihhg_vxtZ7Fnj0B0lKh5lErdb57Tfo
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/health` | All container statuses + DB connectivity |
| GET | `/admin/containers` | List all Docker containers |
| POST | `/admin/containers/{name}/restart` | Restart a container |
| POST | `/admin/containers/{name}/stop` | Stop a container |
| POST | `/admin/containers/{name}/start` | Start a container |
| GET | `/admin/containers/{name}/logs?lines=50` | Tail container logs |
| POST | `/admin/deploy/gateway` | Upload new `main.py` + restart gateway |
| POST | `/admin/deploy/reload` | Restart gateway (no file upload) |
| GET | `/admin/db/schema` | Full column list for all public tables |
| GET | `/admin/db/tables` | List all table names |
| POST | `/admin/db/query` | Read-only SQL query (SELECT only, 500 row cap) |
| GET | `/admin/env` | Safe (non-secret) env vars |

### Example curl Commands

```bash
# Health check
curl https://api.gallagherpropco.com/admin/health \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# DB schema
curl https://api.gallagherpropco.com/admin/db/schema \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# List tables
curl https://api.gallagherpropco.com/admin/db/tables \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Container logs
curl "https://api.gallagherpropco.com/admin/containers/fastapi-gateway/logs?lines=20" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Read-only query
curl -X POST https://api.gallagherpropco.com/admin/db/query \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT table_name FROM information_schema.tables WHERE table_schema='\''public'\'' ORDER BY table_name"}'

# Deploy updated main.py
curl -X POST https://api.gallagherpropco.com/admin/deploy/gateway \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -F "file=@infra/local-api/main.py"

# Restart gateway (no upload)
curl -X POST https://api.gallagherpropco.com/admin/deploy/reload \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

## Trusted-Caller Smoke Commands

Use these after gateway deploys, Access policy changes, or token rotation:

```bash
# Full edge matrix (without headers then with headers)
pnpm smoke:gateway:edge-access
```

Expected:

- `without_access`: Cloudflare `403` for every endpoint in the matrix.
- `with_access`: all endpoints pass edge and hit origin.
- `/admin/health` with service token + `LOCAL_API_KEY` remains origin `403` by design.

---

## Related Docs

- `docs/CLOUDFLARE.md` — Cloudflare Tunnel config (ingress rules, DNS)
- `docs/claude/backend.md` — Gateway architecture, endpoints
- `docs/SUPABASE_TO_LOCAL_MIGRATION.md` — B2 migration and storage cutover notes
