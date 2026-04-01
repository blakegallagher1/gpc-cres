# Reference

## Build Commands

All commands run from repo root unless noted.

```bash
# Full monorepo
pnpm install                 # Install all workspace deps
pnpm build                   # Build all packages + apps
pnpm dev                     # Dev mode (all packages parallel)
pnpm typecheck               # Type-check all packages
pnpm lint                    # Lint all packages
pnpm test                    # Test all packages (vitest)

# Database (Prisma)
pnpm db:migrate              # Run migrations (dev)
pnpm db:deploy               # Deploy migrations (prod)
pnpm db:seed                 # Seed: GPC org + 3 parishes

# Single package
pnpm --filter @entitlement-os/db generate    # Regenerate Prisma client
pnpm --filter @entitlement-os/openai build   # Build agent package
```

### Frontend dev (from apps/web/)

```bash
npm run dev                  # Next.js dev server :3000
npm run build                # Production build
npm run lint                 # ESLint
npm run test                 # Vitest
```

### Vercel deploy build chain (defined in apps/web/vercel.json)

```
db generate → shared build → db build → openai build → next build
```

## Environment Variables

### Root `.env`
```
DATABASE_URL (local dev: direct TCP to Postgres),
DIRECT_DATABASE_URL (same as DATABASE_URL for local dev),
OPENAI_API_KEY, AUTH_SECRET, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE,
LOCAL_API_URL, LOCAL_API_KEY, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET,
QDRANT_URL, QDRANT_API_KEY (optional)
```

### Frontend (`apps/web/.env.local`)
```
DATABASE_URL (local dev TCP), DIRECT_DATABASE_URL,
OPENAI_API_KEY, ALLOWED_LOGIN_EMAILS,
LOCAL_API_URL, LOCAL_API_KEY, CRON_SECRET, GATEWAY_SERVICE_USER_ID,
QDRANT_URL, AGENTS_URL,
SOCRATA_BASE_URL, SOCRATA_APP_TOKEN, GOOGLE_MAPS_API_KEY,
NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN, SENTRY_AGENTS_DSN,
AGENT_SESSION_IDLE_TIMEOUT_MS, AGENT_SESSION_MAX_DURATION_MS
```

### Vercel Production (key vars)
```
GATEWAY_PROXY_URL=https://gateway.gallagherpropco.com  (preferred Prisma /db target)
GATEWAY_PROXY_TOKEN  (optional for Prisma; LOCAL_API_KEY also works against the proxy)
GATEWAY_DATABASE_URL=https://api.gallagherpropco.com  (fallback FastAPI /db endpoint for Prisma)
LOCAL_API_KEY  (gateway bearer token)
LOCAL_API_URL=https://api.gallagherpropco.com
CF_ACCESS_CLIENT_ID=<service token id>
CF_ACCESS_CLIENT_SECRET=<service token secret>
AGENTS_URL=https://agents.gallagherpropco.com
DATABASE_URL  (local-dev/tooling only; should remain non-authoritative in Vercel runtime)
OPENAI_API_KEY
QDRANT_URL=https://qdrant.gallagherpropco.com
QDRANT_API_KEY=<optional if gateway proxies>
CUA_WORKER_URL=https://cua.gallagherpropco.com  (Computer Use Automation worker)
```

**Note:** `LOCAL_API_URL` can point to either subdomain depending on usage context:
- Tile routes use `https://tiles.gallagherpropco.com`
- Data/tools routes use `https://api.gallagherpropco.com`

### Local API Server (Docker Compose on Windows 11)

**Single `.env` file at `C:\gpc-cres-backend\.env`:**
```
GATEWAY_API_KEY=<single bearer token for all endpoints>
CLOUDFLARE_TUNNEL_TOKEN=<tunnel token from Cloudflare dashboard>
DATABASE_URL=postgresql://postgres:postgres@entitlement-db:5432/entitlement_os
QDRANT_URL=http://qdrant:6333
```

**Routing (Cloudflare Tunnel, remotely-managed ingress):**
- `api.gallagherpropco.com` → gateway:8000 (FastAPI)
- `tiles.gallagherpropco.com` → martin:3000 (MVT tiles)
- Catch-all → 404

### Cloudflare Worker (Agent WebSocket)

**Secrets (set via `wrangler secret put`):**
```
OPENAI_API_KEY        # Responses API WebSocket
LOCAL_API_KEY         # Gateway bearer token (same as FastAPI gateway)
LOCAL_API_URL         # https://api.gallagherpropco.com
CF_ACCESS_CLIENT_ID   # Cloudflare Access service token
CF_ACCESS_CLIENT_SECRET
VERCEL_URL            # https://gallagherpropco.com
QDRANT_URL            # optional: direct Worker access
```

**Vars (in `infra/cloudflare-agent/wrangler.toml`):**
```
HYPERDRIVE = "<Cloudflare Hyperdrive binding for Postgres>"
```

**Feature flag (Vercel env):**
```
NEXT_PUBLIC_AGENT_WS_URL=wss://agents.gallagherpropco.com  # Set to enable WebSocket transport
```

### CUA Worker (Computer Use Automation)

**Docker service (in Windows docker-compose.yml):**
```
gpc-cua-worker:
  image: node:22
  working_dir: /app
  volumes:
    - ./gpc-cua-worker:/app
  ports:
    - "3001:3000"
  networks:
    - gpc-cres-backend_internal
  environment:
    OPENAI_API_KEY=<value from .env>
```

**Build & deploy (from `infra/cua-worker/`):**
```bash
npm install
npm run build
# Copy dist/ to Windows server at C:\gpc-cres-backend\gpc-cua-worker\
docker-compose -f C:\gpc-cres-backend\docker-compose.yml up -d gpc-cua-worker
```

**Env vars (`.env` at `C:\gpc-cres-backend\`):**
```
OPENAI_API_KEY=<your-openai-api-key>
```

**Tunnel ingress config (Cloudflare dashboard — remotely managed):**
```yaml
- hostname: cua.gallagherpropco.com
  service: http://gateway:8000     # Routes through FastAPI gateway (Docker internal hostname)
  httpHostHeader: cua.gallagherpropco.com
  # Gateway has explicit POST /tasks, GET /tasks/{id}, GET /cua/health handlers
  # that proxy to CUA_WORKER_URL (default http://cua-worker:3001)
```

## Authoritative data vs semantic recall

- Parcel, deal, and parcel-intelligence data must be fetched in production only through the FastAPI gateway path: `LOCAL_API_URL` + `LOCAL_API_KEY` + Cloudflare Access headers, so queries stay on the local DB server path.
- `GATEWAY_PROXY_URL` is the preferred Prisma target when available because it keeps direct Cloudflare Access dependencies out of Vercel.
- `GATEWAY_DATABASE_URL` remains the fallback Prisma target for control-plane paths that still need PostgreSQL connectivity; it must not be the active path for transactional/parcels/deals reads or writes in runtime request handling.
- `DATABASE_URL` (and `DIRECT_DATABASE_URL`) are local-dev/tooling values only and must not be considered production authoritative.
- Qdrant stays semantic-only. Some semantic helpers are exposed through gateway-authenticated tools (`docs.search`, `memory.write`), while other runtime paths still use direct `QDRANT_URL` access for semantic recall. In all cases, Qdrant augments authoritative Postgres records instead of replacing them.
- After any infra change, run the smoke trio to prove this split remains intact: `pnpm smoke:endpoints` (gateway-backed reads + semantic recall), `pnpm smoke:gateway:edge-access` (Cloudflare Access behavior), and `bash scripts/verify-production-features.sh` (full production harness).

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`): push to `main` + PRs. Node 22 + pnpm workspace filters (`gpc-agent-dashboard`, `@entitlement-os/*`) are the active contract.

Vercel: Git-triggered deploys on push to `main`. Build command in `apps/web/vercel.json`.
Cron jobs: `/api/cron/change-detection` (daily 6 AM), `/api/cron/parish-pack-refresh` (weekly Sunday 4 AM).

## Implementation Roadmap

`docs/archive/2026-03-20-root-cleanup/IMPLEMENTATION_PLAN.md` and `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` are historical planning artifacts. Use `ROADMAP.md` for active implementation status and `docs/SPEC.md` for the current architecture contract.

### Phase Tracker
Update status after each sub-phase ships:

| Sub-Phase | Status |
|-----------|--------|
| 1A: Shared Infra + Notifications | ✅ Done |
| 1B: Smart Alerts & Opportunity Surfacing | ✅ Done |
| 1C: Deadline Tracking & Escalation | ✅ Done |
| 2A: PDF Generation Engine | ✅ Done |
| 2B: Agent-Triggered Generation | ✅ Done |
| 2C: PPTX Generation | ✅ Done |
| 3A: Interactive Pro Forma Builder | ✅ Done |
| 3B: Sensitivity & Scenario Analysis | ✅ Done |
| 3C: Waterfall Distribution Modeling | ✅ Done |
| 3D: Debt Comparison Tool | ✅ Done |
| 4A: Document Processing Pipeline | ✅ Done |
| 4B: Type-Specific Extractors | ✅ Done |
| 5A: Enhanced Map Rendering | ✅ Done |
| 5B: Analytical Map Tools | ✅ Done |
| 5C: Prospecting Mode | ✅ Done |
| 6A: Portfolio Analytics Engine | ✅ Done |
| 7A: Automation Dashboard | ✅ Done |
| 7B: Approval Workflows | ✅ Done |
| 8A: Automated Market Monitoring | ✅ Done |
| 9A: Outcome Tracking | ✅ Done |
| 9B: Knowledge Base & RAG | ✅ Done |

## Cloudflare Worker Commands

```bash
# Deploy Worker + Durable Object
cd infra/cloudflare-agent && npx wrangler deploy

# Set a secret
cd infra/cloudflare-agent && npx wrangler secret put OPENAI_API_KEY

# Tail production logs
cd infra/cloudflare-agent && npx wrangler tail

# Build-time tool schema export (runs automatically as predeploy)
cd infra/cloudflare-agent && npx tsx scripts/export-tools.ts
```

## Gotchas

- Root `.gitignore` has `lib/` pattern - force-add `apps/web/lib/` files
- Delete `apps/web/.next/` before Vercel deploy to avoid FUNCTION_PAYLOAD_TOO_LARGE
- Use `--archive=tgz` for Vercel deploy (repo exceeds 15K file limit)
- `vercel link` overwrites `.env.local` - restore `AUTH_SECRET`, `LOCAL_API_URL/KEY`, and Cloudflare Access vars afterward so gateway-backed Postgres + semantic Qdrant routes still authenticate.
- OpenAI Agents SDK: Zod schemas must use `.nullable()` not `.optional()` for tool params
- OpenAI Agents SDK: Do NOT use `.url()` or `.email()` Zod validators — they add `format: "uri"` / `format: "email"` to JSON schema which OpenAI structured outputs rejects. Use plain `.string()` instead.
- Agent tools are wired in `createConfiguredCoordinator()` (agents/index.ts), NOT on the module-level agent exports
- Property DB `api_search_parcels` was the tricky one - old function with different param names already existed, had to DROP CASCADE all overloads
- Prisma `Decimal` type: Use `{ toString(): string }` in interfaces to accept Prisma Decimal without importing it
- Vercel `buildCommand` has 256 char limit — use `scripts/vercel-build.sh` instead of inline
- Evidence bucket name is `"evidence"` (separate from `"deal-room-uploads"` used for artifacts/uploads)
- `pipelineStep` is `Int` (1-8), not a string enum. Step 4 = Entitlements.
- ParishPackSchema uses `z.string().url()` — this is for Zod validation only (OK), but the JSON schema for OpenAI structured outputs is generated via `zodToOpenAiJsonSchema()` which strips `format:` constraints. Just keep this in mind.
- Parish pack `web_search_preview` tool type must use `as const` assertion in TypeScript to match OpenAI SDK types.
- Durable Object Hibernation API: `acceptWebSocket()` evicts the JS isolate between messages — all instance variables (`this.conv`, `this.clientWs`) are reset. Must recover from `this.state.storage.get()` and `ws` parameter in `webSocketMessage()`.
- Durable Object `sendToClient()`: Use `this.state.getWebSockets()` as fallback when `this.clientWs` is null after hibernation recovery.
- Worker tool routing: Screening endpoints expect camelCase (`parcelId`), but agent tool schemas use snake_case (`parcel_id`) — `tool-router.ts` transforms arguments before gateway calls.
