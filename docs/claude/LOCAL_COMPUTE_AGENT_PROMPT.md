# Coding Agent Prompt: Local Compute + Deals + Parcel Tools

Use this prompt to instruct your coding agent to implement, maintain, or verify the local-compute architecture for **blakegallagher1/gpc-cres** (Entitlement OS).

---

## Quick Copy-Paste (for Cursor / Codex)

```
Implement and maintain the local-compute architecture for gpc-cres:

DEALS: POST/GET /api/deals proxy to FastAPI when LOCAL_API_URL + LOCAL_API_KEY are set. FastAPI writes to APPLICATION_DATABASE_URL with X-Org-Id and X-User-Id.

AGENT PARCEL TOOLS: /tools/parcel.bbox (bbox search on ebr_parcels via ST_Centroid) and /tools/parcel.lookup (parcel ID lookup, fallback to ebr_parcels when api_get_parcel missing). propertyDbTools uses gatewayPost for both.

LOCAL RUN: docker compose -f infra/docker/docker-compose.yml up -d postgres → pnpm db:migrate → cd infra/local-api && python main.py → pnpm dev. Set LOCAL_API_URL=http://localhost:8000 and LOCAL_API_KEY=test-api-key-12345 in apps/web/.env.local.

ARCHITECTURE: Two Cloudflare tunnels (api→8000, tiles→3000). Postgres never exposed. Vercel UI-only. Temporal worker gated by ENABLE_TEMPORAL. See docs/claude/LOCAL_COMPUTE_AGENT_PROMPT.md for full context.
```

---

## Context: Recent Architecture Updates

This repo uses a **zero-cost, local-compute** setup with:

- **Two Cloudflare tunnels** — `tiles.gallagherpropco.com` → Martin :3000, `api.gallagherpropco.com` → FastAPI :8000
- **Postgres never exposed** — no ingress to 5432
- **Vercel UI-only** — no Prisma in production
- **Bearer token auth** for Vercel → FastAPI

The layout is **repo-native** and tailored to the actual structure:

```
gpc-cres/
├── infra/
│   ├── cloudflared/
│   │   ├── config-api.template.yml
│   │   ├── config-tiles.template.yml
│   │   ├── README.md
│   │   └── .gitignore
│   └── local-api/
│       ├── main.py
│       ├── .env.example
│       ├── requirements.txt
│       └── README.md
├── apps/
│   └── web/
│       └── app/deals/page.tsx
```

**Security model:**

| Component      | Exposure                          |
|----------------|-----------------------------------|
| Postgres 5432  | ❌ Never exposed                  |
| FastAPI 8000   | ✅ Only via Cloudflare tunnel     |
| Martin 3000    | ✅ Only via Cloudflare tunnel     |
| Vercel         | ✅ UI only                        |
| Prisma         | ❌ Removed from production path   |
| API Auth       | ✅ Bearer token                   |
| DB Access      | ✅ Localhost only                 |

**Temporal:** The Temporal worker is gated behind `ENABLE_TEMPORAL=true`. When `false` or unset, the worker exits immediately so `pnpm dev` does not fail when Temporal is not running. This migration path does not require Temporal for core workflow.

---

## Task: Implement and Maintain This Architecture

### 1. Deals Saved to Local Server

- **POST /api/deals** → proxies to FastAPI when `LOCAL_API_URL` and `LOCAL_API_KEY` are set
- **GET /api/deals** → same proxy for listing
- FastAPI **POST /deals** writes to the application DB (`APPLICATION_DATABASE_URL`) with `X-Org-Id` and `X-User-Id` headers
- FastAPI **GET /deals** reads from the application DB, org-scoped via `org_id` query param

**Key files:**
- `apps/web/app/api/deals/route.ts` — proxy logic; Prisma fallback only when `LOCAL_API_URL` not set and not production
- `infra/local-api/main.py` — `/deals` GET and POST handlers using `app_db_pool`

### 2. Agent Parcel Tools

- **`/tools/parcel.bbox`** — bbox search using `ebr_parcels` and `ST_Centroid(geom)` for lat/lng. Accepts `west`, `south`, `east`, `north`, `limit`, `parish`. Returns `{ ok, parcels, count, data }`.
- **`/tools/parcel.lookup`** — lookup by parcel ID. Tries `api_get_parcel` RPC first; falls back to direct `ebr_parcels` query when RPC is missing. Returns `{ ok, data }` or `{ ok: false, error }`.

**Key files:**
- `packages/openai/src/tools/propertyDbTools.ts` — `gatewayPost()` for both tools when `LOCAL_API_URL` and `LOCAL_API_KEY` are set
- `infra/local-api/main.py` — `/tools/parcel.bbox` and `/tools/parcel.lookup` handlers

### 3. Local Run Instructions

```bash
# 1. Start application Postgres
docker compose -f infra/docker/docker-compose.yml up -d postgres

# 2. Run migrations
pnpm db:migrate

# 3. Start FastAPI (port 8000)
cd infra/local-api && python main.py

# 4. Start Next.js (port 3000)
pnpm dev
```

**Required env for Next.js** (`apps/web/.env.local`):
```
LOCAL_API_URL=https://api.gallagherpropco.com
LOCAL_API_KEY=<same value as GATEWAY_API_KEY>
```
`LOCAL_API_KEY` must match the backend `GATEWAY_API_KEY` (Bearer token). Backend injects it via `${GATEWAY_API_KEY}` in `.env` line 11.

**Required env for FastAPI** (`infra/local-api/.env`):
- `APPLICATION_DATABASE_URL` — deals, orgs (application DB)
- `DATABASE_URL` — parcels, `ebr_parcels` (property DB); can be same as application DB if single instance
- `API_KEYS` or `GATEWAY_API_KEY` — bearer token(s) for auth (frontend uses same value as `LOCAL_API_KEY`)
- `ALLOWED_ORIGINS` — CORS origins (e.g. Vercel domain)

**Note:** Parcel tools (`/tools/parcel.*`) require the property DB (`DATABASE_URL`). Without it, they return 503. Deals use the application DB (`APPLICATION_DATABASE_URL`).

### 4. Cloudflare Tunnel Setup

- **API tunnel:** `api.gallagherpropco.com` → `http://localhost:8000`
- **Tiles tunnel:** `tiles.gallagherpropco.com` → `http://localhost:3000` (Martin)

Templates live in `infra/cloudflared/`. Real configs and credentials stay out of git (see `.gitignore`).

---

## Verification Checklist

When implementing or changing this flow, verify:

1. [ ] `GET /api/deals` and `POST /api/deals` proxy to FastAPI when `LOCAL_API_URL` + `LOCAL_API_KEY` are set
2. [ ] FastAPI `/deals` uses `app_db_pool` (application DB) and respects `X-Org-Id`
3. [ ] `/tools/parcel.bbox` and `/tools/parcel.lookup` use `db_pool` (property DB) when configured
4. [ ] `propertyDbTools` calls `gatewayPost` for both parcel tools when env is set
5. [ ] Temporal worker exits cleanly when `ENABLE_TEMPORAL` is not true
6. [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass

---

## References

- `CLAUDE.md` — project rules, ROADMAP-first protocol
- `AGENTS.md` — execution model, security invariants, verification protocol
- `docs/claude/architecture.md` — tech stack, agent wiring
- `infra/cloudflared/README.md` — tunnel creation and run commands
- `infra/local-api/README.md` — FastAPI setup and env vars
