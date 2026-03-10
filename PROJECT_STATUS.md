# Project Status (Entitlement OS)

Last reviewed: 2026-02-19

> **Status: Archived snapshot (non-authoritative).**
> This status file reflects an earlier operational baseline and includes superseded Supabase Pro follow-ups.
> Use `ROADMAP.md` for current execution state and `docs/SPEC.md` for architecture truth.

This file is an archived snapshot of historical priorities and is retained for continuity only.

## Current baseline

- Phases A through G are complete and integrated.
- Phase H verification baseline has been achieved (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
- The monorepo architecture is stable across:
  - `apps/web` (Next.js UI + API)
  - `apps/worker` (Temporal)
  - `packages/db`, `packages/openai`, `packages/shared`, `packages/evidence`, `packages/artifacts`

## Recently completed hardening

- Tenant isolation hardening across map, chat, retrieval, and cache paths.
- Secret boundary hardening (removed property DB hardcoded/fallback credential behavior).
- Supabase fail-fast env validation for admin/client initialization paths.
- Map XSS mitigation by escaping user-sourced popup content before HTML insertion.
- Auth consistency hardening via canonical resolver behavior and no auto-provision fallback behavior.
- Generic error response normalization on parcel/map-facing endpoints.
- Concurrency controls for parcel geometry fanout and fetch loops.

## Supabase Pro readiness status (historical / no longer active)

- Read replica wiring: implemented historically in code via env-gated read client.
- Connection pooling wiring: implemented historically in code.
- Custom domain env wiring: implemented historically in code.
- Legacy dashboard follow-up items moved to archival status and are no longer required for current architecture.

## Immediate priorities

1. Keep all new API and automation changes org-scoped (`org_id`) by default.
2. Maintain fail-fast secret/env behavior with no silent defaults.
3. Expand regression coverage for auth, org-scoping, secret boundaries, and map safety.
4. Validate production telemetry + retrieval + parcel-runtime behavior across exact and semantic routes.

## Source of truth

- Planning and completion gating: `ROADMAP.md`
- Architecture contract: `docs/SPEC.md`
- Security/runtime behavior notes: `AGENTS.md`
- Historical Supabase follow-up (retired): `docs/SUPABASE_PRO_CHECKLIST.md`
