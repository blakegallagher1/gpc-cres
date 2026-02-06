# Project Status (Entitlement OS)

This file tracks major completed milestones and the highest-priority remaining work.

## Completed
- Monorepo conversion started: `frontend/` moved to `apps/web/`
- Legacy Python system preserved under `legacy/python/`
- Authoritative spec captured in `docs/SPEC.md`
- Root workspace scripts and Node pin added (`package.json`, `pnpm-workspace.yaml`, `.node-version`)

## In Progress
- Implement Entitlement OS v1.0: DB schema, workflows, evidence vault, artifacts, and web UI/API

## Next
- `packages/db`: Prisma schema + migrations + seed (jurisdictions + seed sources)
- `packages/shared`: Zod schemas + citation enforcement + tests
- `packages/openai`: Responses API wrapper (strict JSON schema outputs + include sources)
- `packages/evidence`: snapshot + extract + hash + Supabase upload
- `packages/artifacts`: PPTX/PDF generators + idempotent versioning
- `apps/worker`: Temporal workflows W1–W5 + schedules
- `apps/web`: Auth/org onboarding + CRUD + workflow triggers + signed URLs + required pages
- Local infra: `infra/docker/docker-compose.yml` (Postgres + Temporal dev server + UI)
- CI update: move from Python+npm to pnpm monorepo

