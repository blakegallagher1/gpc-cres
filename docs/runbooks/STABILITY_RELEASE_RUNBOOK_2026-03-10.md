# Stability Release Runbook (2026-03-10)

Status: Authoritative
Authority: Canonical release note + operating guide for post-stabilization operations
Owner: Platform engineering
Last reviewed: 2026-03-10

## Purpose

This is the canonical "what changed / why / how to operate" document for the March 2026 stabilization workstream across:

- chat stabilization,
- map performance and reliability,
- workflow reliability and idempotency.

Use this file as the first reference before triaging regressions in these areas.

## Operator Quick Reference

Run these in order from repository root for a fast health pass:

```bash
# Automated sentinel (preferred — covers chat/map/workflow in one run)
LOCAL_API_KEY=<key> pnpm exec tsx scripts/observability/stability-sentinel.ts

# Manual checks if sentinel is insufficient
pnpm observability:monitor:prod
pnpm smoke:endpoints
pnpm smoke:gateway:edge-access
pnpm test:docs
pnpm -C apps/web exec vitest run app/api/parcels/route.test.ts app/api/parcels/suggest/route.test.ts
```

Expected quick outcomes:

- Sentinel verdict: PASS (all checks green, workflow WARN acceptable if DB tunnel inactive),
- no unexpected 4xx/5xx spikes on stabilized routes,
- no `405` regression on `POST /api/agent/tools/execute`,
- no map route regression in parcel/suggest behavior,
- docs validation remains green.

**Automated monitoring:** The stability sentinel runs every 10 minutes via Vercel Cron at `/api/cron/stability-sentinel`. Alerts persist to DB and Sentry. See `docs/runbooks/STABILITY_SENTINEL_RUNBOOK.md` for full operations guide.

## Release Summary

### Chat stabilization

- Fixed serverless tool execution crash path on `POST /api/agent/tools/execute`.
- Added runtime-safe handling for shell-workflow-only tools in hosted environments.
- Added `/chat` route redirect behavior to eliminate route-level 404 confusion.
- Hardened `/api/chat` auth error handling to avoid opaque unhandled failures.

Outcome:

- No recurring `405` tool-card errors from prior crash root cause.
- Chat remains accessible through canonical app navigation flow.

### Map performance and reliability

- Reduced parcel initial-load fanout from multiple redundant gateway queries to one primary query.
- Tightened suggest query strategy and bounded gateway search behavior for better typeahead latency.
- Added route-level timeouts for geometry fetch path to prevent long-running hangs.
- Added cache headers to parcel, suggest, and geometry routes.
- Increased geometry batching efficiency on client (`batch size` up, inter-batch delay down).

Outcome:

- Faster initial map render and better polygon fill behavior under normal load.
- Stable geometry route behavior with bounded execution time.

### Workflow reliability and idempotency hardening

- Added deterministic error taxonomy and retryability signaling for automation handlers.
- Added handler timeout guardrails.
- Added durable DB-backed idempotency guard via `automation_events.idempotency_key`.
- Enforced uniqueness through database index and conflict-safe insert semantics.
- Preserved in-memory dedup as L1 fast-path, DB as L2 cross-instance guard.

Outcome:

- Duplicate automation side effects are blocked across serverless instances.
- Failure triage now includes structured error codes and retryability context.

## Operational Runbook

## 1) Standard post-deploy health checks

Run:

```bash
pnpm observability:monitor:prod
pnpm smoke:endpoints
pnpm smoke:gateway:edge-access
```

Expected:

- No new spikes in 4xx/5xx for stabilized routes.
- No recurring `405` on `POST /api/agent/tools/execute`.

## 2) Chat operations checks

Validate:

- `GET /chat` resolves through redirect behavior as expected.
- Chat prompts that use tools do not fail with old serverless skill-loader crash signature.
- `POST /api/agent/tools/execute` shows normal auth/protected behavior when unauthenticated and successful behavior in authenticated app flows.

If degraded:

1. Query Vercel logs for `/api/agent/tools/execute` status `405` or `500`.
2. Check for tool metadata/error payload shape regressions in chat UI.
3. Verify tool registry/environment guards were not reverted.

## 3) Map operations checks

Validate:

- `GET /api/parcels?hasCoords=true` remains low-latency for baseline load.
- `GET /api/parcels/suggest?q=<term>` remains responsive and returns bounded results.
- `GET /api/parcels/{id}/geometry` does not hang and does not show sustained 429/5xx.

If degraded:

1. Check gateway latency and timeout trend.
2. Check cache behavior headers for affected routes.
3. Check geometry request burst patterns for unusual parcel volume.

## 4) Workflow reliability checks

Validate:

- Duplicate automation dispatch attempts for same logical event are blocked by DB idempotency key.
- Failed automation events include structured `errorCode` and `retryable` context.
- No evidence of duplicate side effects across concurrent serverless instances.

If degraded:

1. Inspect `automation_events` entries for repeated idempotency keys.
2. Inspect handler logs for timeout frequency.
3. Confirm `idempotency_key` unique index exists and remains healthy.

## 5) Triage signatures to recognize quickly

- Chat tool regression:
  - `405` on `/api/agent/tools/execute`
  - old skill-directory resolution failures in hosted runtime
- Map regression:
  - high suggest/search latency with gateway timeouts
  - geometry route hangs or rising 429s
- Workflow regression:
  - duplicate automation side effects
  - untyped errors without code/retryability metadata

## 6) Rollback guidance

Trigger rollback when:

- Sev-1 or Sev-2 impact is ongoing and mitigation cannot be completed quickly.

Rollback sequence:

1. Roll back application deployment to last known healthy release.
2. Re-run the health checks in this runbook.
3. Keep DB idempotency column/index in place unless a verified migration failure requires emergency intervention.

## Source files touched by this stabilization stream

**Chat stabilization:**
- `apps/web/app/api/chat/route.ts`
- `apps/web/app/chat/page.tsx`
- `apps/web/app/api/agent/tools/execute/route.ts`
- `apps/web/lib/agent/toolRegistry.ts`

**Map performance:**
- `apps/web/app/api/parcels/route.ts`
- `apps/web/app/api/parcels/suggest/route.ts`
- `apps/web/app/api/parcels/[parcelId]/geometry/route.ts`
- `apps/web/components/maps/useParcelGeometry.ts`

**Workflow reliability:**
- `apps/web/lib/automation/events.ts` (idempotency, timeout, error taxonomy)
- `apps/web/lib/services/automationEvent.service.ts` (durable dedup via ON CONFLICT)
- `packages/db/prisma/schema.prisma` (idempotency_key column)
- `packages/db/prisma/migrations/20260310_add_idempotency_key/migration.sql`

**Stability sentinel:**
- `apps/web/app/api/cron/stability-sentinel/route.ts` (Vercel cron handler)
- `apps/web/app/api/admin/sentinel-alerts/route.ts` (self-hosted webhook receiver)
- `scripts/observability/stability-sentinel.ts` (CLI runner)
- `scripts/observability/sentinel-eval.ts` (evaluation engine)
- `scripts/observability/sentinel-config.ts` (threshold config)
- `scripts/observability/sentinel-eval.test.ts` (21 tests)
- `apps/web/vercel.json` (cron schedule)

## Ownership and update policy

- Update this runbook whenever stabilization-related behavior changes in chat/map/workflow reliability paths.
- Record changes in `docs/CHANGELOG_DOCS.md`.
- Keep `docs/INDEX.md` and `docs/DOCS_MANIFEST.json` aligned with this file path.
