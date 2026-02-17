Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Fix the remaining Phase A build blocker in apps/web/app/prospecting/page.tsx.

Current blocker:
- Build error: `Block-scoped variable 'searchParcels' used before its declaration` (TDZ issue) at around line 164.

Requirements:
- Make the minimal reorder/initialization refactor to remove the TDZ error.
- Do not alter route-consolidation behavior already completed in Phase A.
- Preserve existing prospecting/filters/map state behavior.
- Avoid broad refactors.

After fix run:
- pnpm typecheck
- pnpm lint
- pnpm build

Commit only this scoped fix in one commit and report pass/fail per check plus remaining blockers.
