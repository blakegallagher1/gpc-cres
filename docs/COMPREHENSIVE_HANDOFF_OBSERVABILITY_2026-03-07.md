# Comprehensive Handoff: Production Observability Stack

Date: 2026-03-07  
Branch: current working tree under `gallagher-cres`

Use this handoff when resuming from the current progress checkpoint. It records what was completed, what is left, and the exact continuation plan.

---

## 1) Completed Work (Exact Scope)

### A. Observability Runtime + API Coverage

- Added server-side request telemetry context + request-id plumbing in:
  - `apps/web/lib/server/requestContext.ts` (existing file edited during this workstream)
  - `apps/web/lib/server/observability.ts` (new file)
  - `apps/web/lib/server/observabilityStore.ts` (new file)
- Added server observability events endpoint:
  - `apps/web/app/api/observability/events/route.ts` (modified)
  - Validates payloads with Zod, accepts modern and legacy schemas, records route-aware events and monitor snapshots, supports 401/403/400/500 handling.
- Added admin read endpoint:
  - `apps/web/app/api/admin/observability/route.ts` (new file)
  - Enforces email allowlist + org scoping and returns merged `{ events, monitorSnapshots, stats, filters }`.
- Wired provider/boundary into app shell:
  - `apps/web/app/layout.tsx` (modified)
  - `apps/web/components/observability/observability-provider.tsx` (new file)
  - `apps/web/components/observability/observability-boundary.tsx` (new file)
- Added browser telemetry capture:
  - `apps/web/components/observability/client-telemetry.ts` (new file)
  - Intercepts failed fetches and browser errors and sends to `/api/observability/events`.
- Updated global instrumentation:
  - `apps/web/instrumentation-client.ts` (modified) with breadcrumb filtering for observability endpoint.

### B. Tests for New Observability Module

- Added/updated tests:
  - `apps/web/lib/server/observability.test.ts` (new file)
  - `apps/web/lib/server/observabilityStore.test.ts` (new file)
  - `apps/web/app/api/observability/events/route.test.ts` (modified)
  - `apps/web/app/api/admin/observability/route.test.ts` (new file)
  - `apps/web/components/observability/observability-provider.test.tsx` (new file)
  - `apps/web/components/observability/observability-boundary.test.tsx` (new file)
  - `apps/web/components/observability/client-telemetry.test.ts` (new file)

### C. Production Monitor Script + Wrapper

- Added production monitor script:
  - `scripts/observability/monitor_production.ts` (modified)
  - Supports both old/new env aliases (`OBS_`, `MAP_SMOKE_`, `AUTH_BEARER`, `HEALTH_TOKEN`, etc.).
  - Produces:
    - `output/observability/monitor-<timestamp>.json`
    - `output/observability/monitor-<timestamp>.log`
    - `output/observability/monitor-latest.json`
- Added wrapper with process lifecycle controls:
  - `scripts/observability/start_monitor_prod.sh` (new file)
  - Provides `start|stop|restart|status|tail`.
  - Persists:
    - `output/observability/monitor-prod.pid`
    - `output/observability/monitor-prod.logpath`
    - `output/observability/monitor-prod.startinfo`
    - `output/observability/monitor-prod.latest.log` (symlink)
- Added default monitoring env:
  - `scripts/observability/.env.monitor-prod` (new file)
- Added/updated runbook:
  - `docs/OBSERVABILITY_MONITOR.md` (new file)

### D. Production artifact evidence generated

- New monitor output files in `output/observability` include:
  - `monitor-2026-03-07-033309779Z.json`
  - `monitor-2026-03-07-033309779Z.log`
  - `monitor-latest.json`
  - `monitor-prod.startinfo`
  - `monitor-prod.latest.log`
  - `monitor-prod-20260307-033325.log`

---

## 2) Evidence From Last Live Checks

- Test run:
  - Command:
    - `pnpm exec vitest run apps/web/lib/server/observability.test.ts apps/web/lib/server/observabilityStore.test.ts apps/web/app/api/observability/events/route.test.ts apps/web/app/api/admin/observability/route.test.ts apps/web/components/observability/observability-provider.test.tsx apps/web/components/observability/observability-boundary.test.tsx apps/web/components/observability/client-telemetry.test.ts`
  - Result:
    - Passed: `apps/web/lib/server/observability.test.ts`, `apps/web/lib/server/observabilityStore.test.ts`, `apps/web/app/api/observability/events/route.test.ts`
    - Failed: remaining 7/11 tests across:
      - `apps/web/app/api/admin/observability/route.test.ts` (6)
      - `apps/web/components/observability/client-telemetry.test.ts` (2)
      - `apps/web/components/observability/observability-provider.test.tsx` (3)
      - `apps/web/components/observability/observability-boundary.test.tsx` (suite import failure)
- Root-cause for current failures:
  - Missing `createRequestObservabilityContext` + `attachRequestIdHeader` exports in mock object for `@/lib/server/observability` in `apps/web/app/api/admin/observability/route.test.ts`.
  - Browser tests are using `document` in non-JSDOM runtime (need test setup fix).
  - `apps/web/components/observability/observability-boundary.tsx` imports `@/components/error-boundary/ErrorBoundary` path that is unresolved in test environment import resolution.

---

## 3) What Is Left (Action Plan)

### Priority 1 — Fix failing observability tests

1. `apps/web/app/api/admin/observability/route.test.ts`
   - Ensure mocked export object from `@/lib/server/observability` includes:
     - `createRequestObservabilityContext`
     - `attachRequestIdHeader`
   - Reuse stable `observability.ts` implementations in mock path (or lightweight spies) so route-level request-id behavior stays exercised.
2. `apps/web/components/observability/client-telemetry.test.ts`
   - Configure file/runner with JSDOM context and define `document` before usage in tests.
   - Consider adding `environment` override in inline Vitest config for file or mock `document` safely.
3. `apps/web/components/observability/observability-provider.test.tsx`
   - Same environment baseline issue as above.
4. `apps/web/components/observability/observability-boundary.test.tsx`
   - Resolve import path:
     - either fix `@/components/error-boundary/ErrorBoundary` alias/module, or
     - add targeted mock for the boundary component in this test.

### Priority 2 — Confirm full stack behavior in production monitor

1. Re-run wrapper:
   - `cd /Users/gallagherpropertycompany/Documents/gallagher-cres`
   - `scripts/observability/start_monitor_prod.sh start --once` (or restart w/ loop as required)
2. Verify that wrapper creates expected `output/observability/monitor-*.log|json` artifacts for one run.
3. Confirm `/api/observability/events` health in monitor logic:
   - `OBS_ALLOW_PARTIAL=false` if you want strict pass/fail on POST ingest in single-run mode.

### Priority 3 — Final evidence package + paper trail

1. Re-run:
   - `pnpm exec vitest run ...` for all new observability tests.
2. Execute remaining required verification steps for this scope before claim completion:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build` (use placeholder `OPENAI_API_KEY` if build is blocked by external key expectations).
3. Save one final signed monitor artifact + test report in `output/observability` and docs update summarizing exact pass/fail counts.

---

## 4) Exact “Next Claude Code Prompt” for continuation

```text
You are resuming from /Users/gallagherpropertycompany/Documents/gallagher-cres.

Context:
- I have completed production observability runtime scaffolding and monitor tooling, but several tests still fail.
- Completed paths:
  - New: apps/web/lib/server/observability.ts
  - New: apps/web/lib/server/observabilityStore.ts
  - New: apps/web/lib/server/observability.test.ts
  - New: apps/web/lib/server/observabilityStore.test.ts
  - New: apps/web/components/observability/client-telemetry.ts
  - New: apps/web/components/observability/observability-provider.tsx
  - New: apps/web/components/observability/observability-boundary.tsx
  - New: apps/web/components/observability/observability-provider.test.tsx
  - New: apps/web/components/observability/observability-boundary.test.tsx
  - New: apps/web/components/observability/client-telemetry.test.ts
  - New: apps/web/app/api/admin/observability/route.ts
  - New: apps/web/app/api/admin/observability/route.test.ts
  - Modified: apps/web/app/api/observability/events/route.ts
  - Modified: apps/web/app/api/observability/events/route.test.ts
  - Modified: apps/web/instrumentation-client.ts
  - Modified: apps/web/layout.tsx
  - Modified: scripts/observability/monitor_production.ts
  - New: scripts/observability/start_monitor_prod.sh
  - New: scripts/observability/.env.monitor-prod
  - New: docs/OBSERVABILITY_MONITOR.md

Top priority now:
1) Fix tests in apps/web/app/api/admin/observability/route.test.ts:
   - mock `createRequestObservabilityContext` and `attachRequestIdHeader` in the `@/lib/server/observability` mock.
2) Fix frontend tests:
   - `apps/web/components/observability/client-telemetry.test.ts`
   - `apps/web/components/observability/observability-provider.test.tsx`
   Ensure JSDOM `document` exists and restore test setup.
3) Fix boundary suite import:
   - `apps/web/components/observability/observability-boundary.test.tsx`
   - either provide valid module for `@/components/error-boundary/ErrorBoundary` or mock the import.
4) Re-run focused suite:
   - pnpm exec vitest run apps/web/lib/server/observability.test.ts apps/web/lib/server/observabilityStore.test.ts apps/web/app/api/observability/events/route.test.ts apps/web/app/api/admin/observability/route.test.ts apps/web/components/observability/observability-provider.test.tsx apps/web/components/observability/observability-boundary.test.tsx apps/web/components/observability/client-telemetry.test.ts
5) If all pass, run broader verification in this area:
   - pnpm lint
   - pnpm typecheck
   - pnpm test
   - pnpm build
6) Re-run monitor once:
   - scripts/observability/start_monitor_prod.sh start --once
   - Confirm new monitor-*.json and monitor-*.log under output/observability.
7) Update docs if needed and append exact evidence links/paths in docs/OBSERVABILITY_MONITOR.md.

Acceptance criteria:
- No test regressions in observability suite.
- Production monitor run emits request-id-aware summary and telemetry snapshot for failed/success routes.
- `/api/observability/events` accepts valid modern + legacy event payloads (201).
- `/api/admin/observability` enforces unauthorized/forbidden logic and org scoping.
- New files committed only for scope items above; avoid unrelated file churn.
```

---

## 5) Files currently modified/untracked in this workstream

Tracked modified:
- `apps/web/app/api/observability/events/route.test.ts`
- `apps/web/app/api/observability/events/route.ts`
- `apps/web/instrumentation-client.ts`
- `apps/web/layout.tsx`
- `scripts/observability/monitor_production.ts`

New:
- `apps/web/app/api/admin/observability/route.ts`
- `apps/web/app/api/admin/observability/route.test.ts`
- `apps/web/components/observability/client-telemetry.ts`
- `apps/web/components/observability/client-telemetry.test.ts`
- `apps/web/components/observability/observability-boundary.tsx`
- `apps/web/components/observability/observability-boundary.test.tsx`
- `apps/web/components/observability/observability-provider.tsx`
- `apps/web/components/observability/observability-provider.test.tsx`
- `apps/web/lib/server/observability.ts`
- `apps/web/lib/server/observability.test.ts`
- `apps/web/lib/server/observabilityStore.ts`
- `apps/web/lib/server/observabilityStore.test.ts`
- `scripts/observability/start_monitor_prod.sh`
- `scripts/observability/.env.monitor-prod`
- `docs/OBSERVABILITY_MONITOR.md`

Output artifacts generated:
- `output/observability/monitor-2026-03-07-033309779Z.json`
- `output/observability/monitor-2026-03-07-033309779Z.log`
- `output/observability/monitor-latest.json`
- `output/observability/monitor-prod.startinfo`
- `output/observability/monitor-prod.latest.log`
- `output/observability/monitor-prod-20260307-033325.log`

---

## 6) Sensitive note

- `scripts/observability/.env.monitor-prod` currently contains credentials/tokens for direct-prod smoke checks.
- Rotate and rotate-backup any production bearer/session token after sharing this handoff outside trusted context.
