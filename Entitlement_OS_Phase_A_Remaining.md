Last reviewed: 2026-02-19

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.
Continue Phase A only and complete remaining work (do not revert route redirect changes already done).

Goal: finish functional consolidation for:
- /runs page with History + Intelligence tabs in one page, preserving query params for history tab.
- /prospecting integrate Saved Filters panel/dropdown and state+map behavior.
- /automation add Builder tab with workflow list/template/gallery/create/edit/run controls.
- /portfolio add Outcomes tab and Buyers cross-view.
- /deals add Triage Queue view mode and deal detail Buyers + Room/Collaborate tabs.
- /reference create two-tab page (Evidence Sources, Jurisdictions) and rewire links accordingly.
- Sidebar exact final structure: 12 items across 4 groups (Core/Pipeline/Intelligence/Settings), no dead links.
- Ensure every legacy route redirect still resolves to new consolidated destinations.
- If any of the above is partially done, only fill gaps; do not duplicate routes.

After each numbered subtask commit.
Then run checks for this phase:
- pnpm lint
- pnpm typecheck
- pnpm test (relevant suites)
- pnpm build (if feasible)
- Report pass/fail and list exactly what remains.
