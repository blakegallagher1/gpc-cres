# Release Verification Runbook

Status: Authoritative
Authority: Required release verification gates
Owner: Release owner
Last reviewed: 2026-03-09

## Required Gate (in order)

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `OPENAI_API_KEY=placeholder pnpm build`
5. Observability one-shot:
   - `pnpm observability:monitor:prod` (with required env vars)

## Pass Criteria

- Lint/typecheck/test/build complete without failures caused by release changes.
- Observability monitor has no unexpected hard failures on critical routes.
- No auth/org-scoping/security regression introduced.

## Pre-Release Checklist

- Confirm `ROADMAP.md` reflects current status/evidence.
- Confirm docs updates are captured in `docs/CHANGELOG_DOCS.md` if contracts/runbooks changed.
- Confirm archived docs are correctly labeled non-authoritative when touched.

## Post-Release Checklist

- Re-run one-shot observability monitor.
- Validate key user journeys:
  - `/map`
  - `/deals`
  - `/api/parcels`
  - `/api/map/comps`
  - `/api/observability/events`
- Save monitor artifacts under `output/observability/`.

## Rollback Trigger

Rollback immediately if:

- auth/session failures block normal access,
- core API surfaces fail repeatedly (`/api/deals`, `/api/parcels`, `/api/map/*`),
- severe data-path regression appears in monitor + smoke checks.
