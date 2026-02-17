Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Finish the remaining Phase A build blocker in apps/web/app/automation/page.tsx:817.

Issue:
- Build still fails with `Argument of type 'number | null' is not assignable to parameter of type 'number'` from `formatDuration(h.avgDurationMs)`.

Requirements:
- Make a minimal null-safe fix in the feed metrics render path (for example: guard null before formatting, or fallback value) without changing UI behavior for valid durations.
- Keep existing functionality and Phase A consolidation changes intact.
- Do not perform broader refactors.
- Keep endpoint/route logic unchanged.

After fix run:
- pnpm typecheck
- pnpm lint
- pnpm build

Commit only this scoped fix.
Report pass/fail for each command and any remaining blockers.
