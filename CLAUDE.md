# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gallagher Property Company CRES — a full-stack CRE (Commercial Real Estate) AI agent platform. Python/FastAPI backend with 12 specialized OpenAI Agents SDK agents (Research, Finance, Legal, Design, Operations, Marketing, Risk, Deal Screener, Due Diligence, Entitlements, Market Intel, Tax Strategist) orchestrated by a Coordinator. Next.js 16 / React 19 frontend dashboard with Supabase auth and real-time collaboration.

## Repository Structure

```
apps/web/           → Next.js 16 frontend (TypeScript, React 19)
legacy/python/      → FastAPI backend (Python 3.11+, OpenAI Agents SDK)
infra/docker/       → Docker infrastructure config
packages/           → Shared packages (reserved)
.github/workflows/  → CI (ci.yml), auto-merge
```

The repo is mid-migration: files moved from `frontend/` → `apps/web/` and root Python → `legacy/python/`. CI still references `frontend/` paths for the frontend job.

## Build & Dev Commands

### Backend (run from `legacy/python/`)

```bash
make install          # pip install -r requirements.txt
make dev              # uvicorn main:app --reload --port 8000
make test             # pytest (excludes integration)
make test-all         # pytest including @pytest.mark.integration
make lint             # flake8 + pylint
make format           # black + isort
make type-check       # mypy
```

If `make` is missing from PATH, use `/usr/bin/make` or run commands directly. For reliable test runs, use a venv: `.venv/bin/python -m pytest tests/ -v --ignore=tests/integration`.

### Frontend (run from `apps/web/`)

```bash
npm run dev           # Next.js dev server (port 3000)
npm run build         # Production build
npm run lint          # ESLint
npm run test          # Jest
npx playwright test   # E2E tests
```

If npm fails with `spawn sh ENOENT`, prefix with `PATH=/usr/bin:/bin:$PATH NPM_CONFIG_SCRIPT_SHELL=/bin/sh`.

### Running a single test

```bash
# Python - specific test file or test function
.venv/bin/python -m pytest tests/test_screening_scoring.py -v
.venv/bin/python -m pytest tests/test_agents.py::test_coordinator -v

# Frontend - specific test file
cd apps/web && npm test -- --testPathPattern=auth/allowed-emails
```

## Architecture

### Agent System (`legacy/python/gpc_agents/`)

All agents use OpenAI Agents SDK (`openai-agents>=0.7.0`). The Coordinator agent delegates to 11 specialist agents via `handoff()`. Handoff relationships are configured in `gpc_agents/__init__.py` on module import. Agent tools are `FunctionTool` instances (not directly callable — use `on_invoke_tool` with JSON args in tests).

**Model selection**: Coordinator + Finance use GPT-5.2 (flagship); others use GPT-5.1. Configurable via `OPENAI_FLAGSHIP_MODEL` / `OPENAI_STANDARD_MODEL` env vars.

### Workflow Orchestration (`legacy/python/workflows/runner.py`)

Three patterns: Sequential (Research → Risk → Finance → Synthesis), Parallel (all agents concurrent), Iterative (initial → gap analysis → deep dive → final). Entry points: `run_development_workflow()`, `evaluate_project()`, `quick_research()`, `quick_underwrite()`.

### Frontend Architecture (`apps/web/`)

- **Routing**: Next.js App Router (`app/` directory)
- **State**: Zustand stores (`stores/agentStore.ts`, `stores/uiStore.ts`)
- **Data fetching**: SWR hooks (`lib/hooks/use*.ts`)
- **UI**: shadcn/ui + Radix primitives + Tailwind CSS
- **Workflow editor**: `@xyflow/react` for visual DAG editing
- **Collaboration**: TipTap + Yjs for real-time document editing in Deal Room
- **Auth**: Supabase Auth (Google OAuth + email/password), allowlist enforced in `AuthGuard.tsx` and `app/auth/callback/route.ts`

### Database

Supabase PostgreSQL. Schema in `legacy/python/database/schema.sql`, migrations in `legacy/python/database/migrations/`. Run migrations via Supabase SQL Editor. Backend uses `tools/database.py` (DatabaseManager). Missing tables return `PGRST205` — caught and logged, won't crash startup.

## Key Gotchas

- Root `.gitignore` has a `lib/` pattern that ignores `apps/web/lib/` — ensure frontend lib files are force-added to git
- Vercel project name must be lowercase (`gpc-cres`)
- Delete `apps/web/.next/` before `vercel deploy` to avoid `FUNCTION_PAYLOAD_TOO_LARGE`
- `vercel link` overwrites `.env.local` — restore Supabase keys after relinking
- Backend `make test` uses system Python; use `.venv/bin/python -m pytest` for deps to resolve
- `requirements.lock` contains macOS-only packages (`pyobjc`); CI installs from `requirements.txt`

## Environment Variables

### Backend (`legacy/python/.env`)
Required: `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `GOOGLE_MAPS_API_KEY`, `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`

### Frontend (`apps/web/.env.local`)
Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
Optional: `NEXT_PUBLIC_BACKEND_URL`, `OPENAI_API_KEY`, `ALLOWED_LOGIN_EMAILS`

## CI

GitHub Actions `ci.yml` runs on push to `main` and PRs: backend (Python 3.11 lint → type-check → test), frontend (Node 22 lint → test → build). Frontend CI needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` as GitHub secrets.

## Code Style

- **Python**: Black (line-length 100), isort, flake8 (max 120), pylint. Type hints on public functions. `pyproject.toml` has all tool configs.
- **TypeScript**: ESLint with `eslint-config-next`. Strict TS. Components PascalCase, hooks `use*` prefix.
- **Commits**: Short imperative summaries with optional scope (e.g., `tools: add flood lookup`).
