# Project Status (Entitlement OS)

Last reviewed: 2026-02-19

This file tracks current implementation baseline and immediate priorities.

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

## Supabase Pro readiness status

- Read replica wiring: implemented in code via env-gated read client; dashboard replica provisioning pending.
- Connection pooling wiring: implemented in code; pooled endpoint selection remains deployment/config responsibility.
- Custom domain env wiring: implemented in code; DNS/TLS/callback setup remains dashboard/infra responsibility.
- PITR, spend caps, and log drains: dashboard-only operational items; tracked in `docs/SUPABASE_PRO_CHECKLIST.md`.

## Immediate priorities

1. Keep all new API and automation changes org-scoped (`org_id`) by default.
2. Maintain fail-fast secret/env behavior with no silent defaults.
3. Expand regression coverage for auth, org-scoping, secret boundaries, and map safety.
4. Complete dashboard-side Supabase Pro actions and record evidence in operations runbooks.

## Source of truth

- Planning and completion gating: `ROADMAP.md`
- Architecture contract: `docs/SPEC.md`
- Security/runtime behavior notes: `AGENTS.md`
- Supabase Pro operations checklist: `docs/SUPABASE_PRO_CHECKLIST.md`
