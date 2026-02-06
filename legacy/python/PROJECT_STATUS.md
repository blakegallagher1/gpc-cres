# GPC Dashboard Status

Last updated: 2026-02-05

## Changes Completed
- Updated seed data to use GPT-5.2 models (removed gpt-4o) in `seed_supabase.py`.
- Updated SQL seed to use GPT-5.2 models in `database/seed_dashboard.sql`.
- Seeded Supabase via `seed_supabase.py`.
- Applied SQL seed via Supabase transaction pooler (counts verified: 9 agents, 2 workflows, 3 runs, 11 traces).
- Updated frontend dependencies (safe upgrades), added `ts-node` for Jest config, and aligned `next`/`eslint-config-next` to 15.5.7.
- Moved Jest setup helpers out of `__tests__` to eliminate empty-suite failures; tests now pass.
- Upgraded frontend to Next.js 16 and migrated linting to ESLint flat config; audit is clean.
- Validated production build on Next.js 16; updated Jest setup path to keep test helpers out of build typecheck.
- Bumped Python dependency minimums for safe updates (OpenAI, Pydantic, Supabase, SQLAlchemy, Google clients, date/time utils, mypy/flake8).
- Resolved mypy type errors across agents/tools, added pytest bootstrap for env/path, and hardened Google Maps client init; `make lint`, `make type-check`, and `make test` now pass.
- Applied additional safe Python upgrades with explicit upper bounds (FastAPI/Uvicorn/HTTPX/pytest/black/isort, numpy/pandas/b2sdk), added missing `numpy-financial` and lint tool deps, aligned `pyproject.toml`, and validated via a local `.venv` (flake8 + pylint + mypy + pytest all green).
- Generated `requirements.lock` from the validated `.venv` for reproducible installs.
- Refreshed `requirements.lock` after upgrading Python packages and revalidated `make lint`, `make type-check`, and `make test`.
- Frontend validation: `npm run lint`, `npm test`, and `npm run build` all pass on Next.js 16.1.6 (noted middleware deprecation warning).
- Migrated `frontend/middleware.ts` to `frontend/proxy.ts` and updated export to `proxy`; Next 16 build passes without the deprecation warning.
- Created new Vercel project `gpc-cres` in Blake's projects, added `frontend/vercel.json` to enforce Next.js, set Supabase env vars for preview/production, deployed successfully, and removed the old `frontend` project.
- Added `frontend/app/api/health` to validate all `.env` keys in Vercel, applied root `.env` vars to preview/production/development, redeployed, and verified the health endpoint returns `status: ok` with no missing keys.
- Secured `/api/health` with token or Supabase session auth (HEALTHCHECK_TOKEN/VERCEL_ACCESS_TOKEN), trimmed token input to tolerate newline artifacts, redeployed, and verified the auth-protected health endpoint.
- Added build metadata (commit SHA/ref/provider) to `/api/health`, restored `frontend/vercel.json`, and updated the Vercel project settings to `frontend` + Next.js with Node 22 for correct builds.
- Unignored `frontend/lib` in `.gitignore`, committed the frontend lib sources, redeployed to Vercel, and verified `/api/health` reflects the latest GitHub SHA on `gpc-cres.vercel.app`.
- Enabled GitHub branch protection on `main` (PR-only, required checks) and added an auto-merge workflow to merge PRs once checks pass without reviews.
- CI now runs a frontend production build with Supabase envs sourced from GitHub secrets in addition to lint/tests.
- Auto-merge workflow now targets the PR number directly to avoid failing checks.
- Added Google OAuth login flow with allowlist enforcement for `blake@gallagherpropco.com`, including AuthGuard checks and a Supabase callback route.
- Switched login UI to email/password-only sign-in (removed Google OAuth button) while keeping allowlist enforcement.
- Removed the login page sign-up link and added a visible Sign Out control in the header for easier auth testing.
- Added new backend agents (Deal Screener, Due Diligence, Entitlements, Market Intelligence) with prompts, tools, and coordinator wiring.
- Added new Pydantic schemas, DB schema tables/indexes/RLS, and API endpoints for the four new agents.
- Extended database helpers for CRUD across screener, diligence, entitlements, and market intel records.
- Added unit tests for new schemas and deal screener scoring logic.
- Added Tax Strategist agent with IRC reference library lookup, tax update search tool, coordinator routing, API endpoint, seed data, and unit tests.
- Created a one-page application summary in PROJECT_SUMMARY.md covering all current agents and capabilities.
- Added an in-memory database fallback for local agent runs via `USE_IN_MEMORY_DB`.
- Replaced dict-based tool placeholders with Agents SDK tools (WebSearch + Code Interpreter config).
- Made Legal agent file search optional based on `OPENAI_VECTOR_STORE_IDS`.
- Added `scripts/run_agent_api_exercises.py` to exercise all agent endpoints and capture results.
- Executed full agent API exercise run; results stored under `output/agent_api_exercises_2026-02-03_21-38-19.*`.
- Normalized in-memory DB sort keys to avoid mixed-type comparison errors during list operations.
- Agent API exercise runner now falls back to `sys.executable` if `.venv/bin/python` is unavailable.
- Built the Deal Room UI (chat, timeline, artifacts, tasks, scenario sandbox, exports, ingestion) with Supabase realtime subscriptions and FastAPI SSE agent streaming.
- Added a Copilot side panel + command palette actions (Deal Room navigation, Copilot toggle) and header control.
- Added Deal Room routes (`/deal-room` list + `/deal-room/[projectId]`) and new copilot components.
- Added new Deal Room frontend types and `NEXT_PUBLIC_BACKEND_URL` to `frontend/.env.example`.
- Improved ingestion processing to download from `storage_url` when no local file path is present and clean up temp files.
- Wired TipTap + Yjs collaborative memo editing with a `/collab` ypy-websocket endpoint and a new `CollaborativeMemo` component in the Deal Room UI.
- Added background job orchestration for ingestion and export pipelines with retries, failure handling, and requeue of pending jobs on startup.
- Added job queue schema updates (payload/errors), handler wiring, and list helpers for export/ingestion jobs, plus new frontend export job fields and dependencies.
- Added Screening MVP backend: intake, scoring runs, overrides, playbook versioning, CSV export, and job queue processing.
- Added OCR fallback for PDFs (pdftoppm + tesseract) when text extraction is empty.
- Added Screening frontend pages (list, intake, detail, playbook) and sidebar navigation.
- Added screening runtime unit tests for overrides, confidence, and parsing helpers.
- Aligned screening yield scoring with yield-on-cost bands and tightened list filters to exclude deals without runs/scores when filters apply.
- Fixed screening detail metrics display to show valid zero values instead of `--`.

## Pending / Remaining Tasks
- Verify frontend pages render with real data in the deployed environment (Dashboard, Agents, Workflows, Runs).
- Confirm local dev server startup and no console errors on key routes.
- Validate backend integration (API routes + OpenAI Agents SDK wiring) once endpoints are ready.
- Optional: add monitoring envs (e.g., `SENTRY_DSN`) if desired.
