Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Do not modify Phase A consolidation behavior; only fix the existing build blocker.

Goal: fix build failure in
- apps/web/app/api/buyers/route.ts:96

Current issue:
- `Property 'outreach' does not exist on type ...` during `pnpm build`.

Requirements:
- Locate the exact typed object at line ~96 and align it to the actual Buyer schema/type.
- Preserve existing endpoint behavior and responses unless a type rename/field mapping is required for correctness.
- Keep API route security and org scoping intact.
- Do not rework route redirects or previously completed Phase A consolidation wiring.
- After fix, run only this task-focused verification:
  - pnpm typecheck
  - pnpm lint
  - pnpm build
- Report pass/fail clearly and list any remaining blockers.

Commit only this fix (single scoped commit).
