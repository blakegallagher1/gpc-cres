# Test Matrix Starter

Last reviewed: 2026-02-19


This directory contains the starter matrix for component-level test coverage across agents, tools, API routes, automation modules, and cross-cutting features.

## Files

- `test-matrix-starter.json`: canonical matrix source (for review and CI validation)
- `test-matrix-starter.csv`: spreadsheet-friendly export

## Commands

- Generate/refresh matrix:
  - `pnpm test:matrix:generate`
- Validate discovered components are represented:
  - `pnpm test:matrix:validate`
- Generate Phase 1 per-component stub packs (agents + tools):
  - `pnpm test:phase1:stubs:generate`
- Track Phase 1 completion from matrix-linked test IDs:
  - `pnpm test:phase1:track`
- Enforce Phase 1 full completion in CI (no `it.todo` remaining):
  - `pnpm test:phase1:track:complete`

## E2E Stability Notes (Playwright)

If Playwright flakes locally, run the suite 3 times to confirm whether it's a transient dev-server/hydration issue:

```bash
for i in 1 2 3; do echo "RUN $i" && pnpm -C apps/web exec playwright test || break; done
```

Known flake source: the Copilot side panel can intercept pointer events and block navigation clicks.
When authoring E2E tests, prefer the shared helper `clickNavAndWaitForURL()` for navigation, and call `ensureCopilotClosed()` before clicks when needed.

## CI usage

Use `pnpm test:matrix:validate` as an early CI gate to prevent orphaned components from landing without test plan coverage.

For Phase 1, use `pnpm test:phase1:track` to ensure all expected matrix-linked test IDs exist.
Use `pnpm test:phase1:track:complete` only when you want CI to fail until all stub tests are fully implemented.

## Notable chat runtime coverage (current)

- Session persistence / compaction / dedupe:
  - `apps/web/lib/chat/__tests__/session.test.ts`
- Chat resume endpoint:
  - `apps/web/app/api/chat/resume/route.test.ts`
- Tool approval resume endpoint:
  - `apps/web/app/api/chat/tool-approval/route.test.ts`
- Run-state serialization envelope utility:
  - `packages/openai/test/phase1/utils/runStateSerde.phase1.test.ts`
