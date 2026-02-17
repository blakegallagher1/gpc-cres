Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Fix the remaining Phase A build blocker in apps/web/app/automation/page.tsx:514.

Issue:
- Type error: Argument of type `number | null` is not assignable to parameter of type `number` when calling `formatDuration(ev.durationMs)`.
- Root cause is nullable `ev.durationMs` usage in feed table rendering.

Requirements:
- Make a minimal type-safe fix (for example normalize null to `0` or guard before calling `formatDuration`) while preserving existing runtime behavior.
- Keep existing feature behavior unchanged for non-null values.
- Preserve auth patterns and org-scoping; do not modify route-consolidation logic completed for Phase A.
- Avoid broad refactors.

After the fix run only:
- pnpm typecheck
- pnpm lint
- pnpm build

Commit only this targeted fix in one commit.
Report pass/fail for each check and list any remaining blockers.
