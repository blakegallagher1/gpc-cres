# GitHub Copilot Instructions for Entitlement OS

This is a TypeScript/Next.js monorepo for Entitlement OS — an automation-first operating system for commercial real estate entitlement processes in Louisiana. The platform combines a 13-agent AI coordinator with a deal pipeline UI, property database integration, and document generation.

## Tech Stack

- **Frontend**: Next.js 16.1.6 (App Router), React 19, shadcn/ui + Radix + Tailwind
- **Backend**: Next.js API routes
- **Database**: PostgreSQL via Supabase (Prisma ORM)
- **Auth**: Supabase Auth (Google OAuth + email)
- **AI**: @openai/agents SDK (13 specialized agents)
- **Package Manager**: pnpm 9.11.0
- **Node**: 22
- **TypeScript**: 5.7.3 (strict mode)

## Repository Structure

```
entitlement-os/
├── apps/
│   ├── web/                 # Next.js frontend + API routes
│   │   ├── lib/automation/  # 12 event-driven automation handlers
│   │   └── lib/server/      # Server-only modules
│   └── worker/              # Temporal worker (parked for v2)
├── packages/
│   ├── db/                  # Prisma schema, migrations, seed
│   ├── openai/              # 13 agents + ~26 tools
│   ├── shared/              # Zod schemas, enums, validators
│   ├── evidence/            # URL snapshot, text extraction
│   └── artifacts/           # PDF + PPTX generation
├── infra/docker/            # Local dev infra (Postgres + Temporal)
├── legacy/python/           # Frozen reference (DO NOT modify)
└── docs/                    # PLAN.md, SPEC.md, AUTOMATION-FRONTIER.md
```

## Development Workflow

### Setup
```bash
# Install dependencies
pnpm install

# Create environment file
cp .env.example .env

# Run migrations and seed
pnpm db:migrate
pnpm db:seed
```

### Development
```bash
# Start all services in dev mode
pnpm dev

# Start individual services
pnpm --filter gpc-agent-dashboard dev
pnpm --filter @entitlement-os/openai dev
```

### Before Committing
```bash
# Type check (builds packages first)
pnpm typecheck

# Lint all packages
pnpm lint

# Run tests
pnpm test

# Build everything
pnpm build
```

### Database Operations
```bash
# Run migrations (development)
pnpm db:migrate

# Deploy migrations (production)
pnpm db:deploy

# Seed database
pnpm db:seed

# Regenerate Prisma client (after schema changes)
pnpm --filter @entitlement-os/db generate
```

## Code Standards

### TypeScript
- **Strict mode enabled** — all code must pass strict type checking
- Use explicit types for function parameters and return values
- Avoid `any` — use `unknown` or proper types
- Use `Record<string, unknown>` for dynamic objects

### React/Next.js
- Use App Router patterns (not Pages Router)
- Components should be PascalCase
- Hooks should use `use*` prefix
- Server-only code must import `"server-only"` module
- Never expose secrets (OpenAI API key, Supabase service role key) to client

### Naming Conventions
- **Tools**: snake_case (e.g., `get_deal_context`)
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Components**: PascalCase

### Database
- **Multi-tenant by design** — all queries MUST scope by `orgId`
- Use Prisma's `findFirstOrThrow({ where: { id, orgId } })` pattern
- Never delete the `orgId` check in queries
- Supabase Storage uses private buckets with signed URLs only

### Security
- All API routes must authenticate Supabase session
- Confirm org membership before data access
- Scope all DB queries by `orgId`
- Never commit secrets or sensitive data
- Server-only secrets: OpenAI API key, Supabase service role key

### Error Handling
- Tool `execute()` functions return `JSON.stringify({ error: "..." })` on failure
- API routes use try/catch returning `NextResponse.json({ error }, { status })`
- Use type-safe error handling with proper TypeScript types

### AI Agents
- 13 agents in `packages/openai/src/agents/`
- Tools attached via `withTools()` in `createConfiguredCoordinator()`
- Never attach tools on module-level agent exports
- Use OpenAI Responses API (not Chat Completions API)
- All AI outputs must pass strict Zod schema validation

### Testing
- Use existing test frameworks (Jest in apps/web, Vitest in packages)
- Write tests for new exported functions
- Mock external APIs in unit tests
- No live network calls in unit tests

### Automation
- 12 automation loops in `apps/web/lib/automation/`
- Events dispatched with `.catch(() => {})` — fire-and-forget pattern
- Import `@/lib/automation/handlers` in API routes that dispatch events
- Read `AUTOMATION_CONFIG` for guardrail thresholds

## Key Guidelines

1. **Preserve existing architecture** — follow established patterns
2. **Multi-tenant isolation** — always scope by `orgId`
3. **Security first** — never weaken auth or validation
4. **Minimal changes** — make surgical, focused modifications
5. **Type safety** — strict TypeScript with no `any`
6. **Test coverage** — add tests for new functionality
7. **Documentation** — update docs for significant changes
8. **Never modify** `legacy/python/` unless explicitly requested

## Build Dependencies

The build order matters:
1. Prisma client generation (requires `.env` file)
2. Shared package (Zod schemas)
3. DB package (Prisma client)
4. OpenAI package (agents + tools)
5. Evidence, Artifacts packages
6. Web application

CI runs: `cp .env.example .env` before Prisma generate because db scripts load env via `dotenv -e ../../.env`.

## Deployment

- **Frontend**: Vercel (auto-deploys from main branch)
- **Build chain**: `db generate → shared → db → openai → next build`
- **Environment**: Node 22, pnpm 9.11.0
- **Cron jobs**: Change detection (daily 6 AM), Parish pack refresh (weekly Sunday 4 AM)

## Reference Documentation

- Architecture spec: `docs/SPEC.md`
- Implementation plan: `IMPLEMENTATION_PLAN.md`
- Automation frontier: `docs/AUTOMATION-FRONTIER.md`
- Agent guidelines: `AGENTS.md` (for Codex)
- Project overview: `CLAUDE.md` (for Claude)
