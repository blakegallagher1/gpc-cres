# Test Matrix Starter

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

## CI usage

Use `pnpm test:matrix:validate` as an early CI gate to prevent orphaned components from landing without test plan coverage.

For Phase 1, use `pnpm test:phase1:track` to ensure all expected matrix-linked test IDs exist.
Use `pnpm test:phase1:track:complete` only when you want CI to fail until all stub tests are fully implemented.
