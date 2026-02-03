# GPC Dashboard Status

Last updated: 2026-02-03

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

## Pending / Remaining Tasks
- Verify frontend pages render with real data in the deployed environment (Dashboard, Agents, Workflows, Runs).
- Confirm local dev server startup and no console errors on key routes.
- Validate backend integration (API routes + OpenAI Agents SDK wiring) once endpoints are ready.
- Optional: add monitoring envs (e.g., `SENTRY_DSN`) if desired.
