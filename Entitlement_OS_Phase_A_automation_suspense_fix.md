Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Complete the remaining Phase A build blocker:
- Next.js prerender error at /automation:
  - `useSearchParams() should be wrapped in a suspense boundary at page "/automation"`

Scope:
- Fix only `apps/web/app/automation/page.tsx` to satisfy Next.js prerendering requirements for `useSearchParams`.
- Keep all existing Phase A consolidation behavior and existing UI logic unchanged.
- Do not modify the already-completed route redirect/consolidation work.
- Avoid broad refactors.

Requirements:
- Use a minimal, idiomatic fix (for example: component boundary split + `<Suspense>` wrapper, or Next-compatible safe pattern already used in repo).
- Preserve all current functionality for tabs/feed/health/failures/builder rendering.

After fix run:
- pnpm typecheck
- pnpm lint
- pnpm build

Commit only this scoped change in one commit.
Report pass/fail for each command and whether this clears all build blockers.
