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
pnpm test                    # Test all packages (vitest + jest in apps/web)

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
npm run test                 # Jest
```

### Vercel deploy build chain (defined in apps/web/vercel.json)

```
db generate → shared build → db build → openai build → next build
```

## Environment Variables

### Root `.env`
```
DATABASE_URL, DIRECT_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY,
TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_TASK_QUEUE
```

### Frontend (`apps/web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
OPENAI_API_KEY, ALLOWED_LOGIN_EMAILS,
LOCAL_API_URL, LOCAL_API_KEY, CRON_SECRET,
SOCRATA_BASE_URL, SOCRATA_APP_TOKEN, GOOGLE_MAPS_API_KEY
```

**Note:** `LOCAL_API_URL` can point to either subdomain depending on usage context:
- Tile routes use `https://tiles.gallagherpropco.com`
- Data/tools routes use `https://api.gallagherpropco.com`

### Local API Server (Docker Compose on Windows 11)

**Single `.env` file at `C:\gpc-cres-backend\.env`:**
```
GATEWAY_API_KEY=<single bearer token for all endpoints>
CLOUDFLARE_TUNNEL_TOKEN=<tunnel token from Cloudflare dashboard>
DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/cres_db
QDRANT_URL=http://qdrant:6333
```

**Routing (Cloudflare Tunnel, remotely-managed ingress):**
- `api.gallagherpropco.com` → gateway:8000 (FastAPI)
- `tiles.gallagherpropco.com` → martin:3000 (MVT tiles)
- Catch-all → 404

## CI/CD

GitHub Actions (`ci.yml`): push to `main` + PRs. Backend (Python 3.11) + Frontend (Node 22).
**Known issue:** CI still references old `frontend/` paths — needs update to `apps/web/`.

Vercel: Git-triggered deploys on push to `main`. Build command in `apps/web/vercel.json`.
Cron jobs: `/api/cron/change-detection` (daily 6 AM), `/api/cron/parish-pack-refresh` (weekly Sunday 4 AM).

## Implementation Roadmap

Read `IMPLEMENTATION_PLAN.md` at the repo root for the full 9-phase feature roadmap, all architectural conventions, and shared infrastructure patterns.

**All 9 phases complete.** Implementation plan fully executed.

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

## Gotchas

- Root `.gitignore` has `lib/` pattern - force-add `apps/web/lib/` files
- Delete `apps/web/.next/` before Vercel deploy to avoid FUNCTION_PAYLOAD_TOO_LARGE
- Use `--archive=tgz` for Vercel deploy (repo exceeds 15K file limit)
- `vercel link` overwrites `.env.local` - restore Supabase keys after
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
