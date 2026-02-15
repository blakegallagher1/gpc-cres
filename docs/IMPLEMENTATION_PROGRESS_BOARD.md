# Implementation Progress Board

Date generated: 2026-02-15
Primary goal for this pass: make the screening feature usable, stabilize chat submission behavior, and add guided onboarding for empty sections while tracking broader roadmap execution.

## Execution status

- [x] Create implementation tracking file with full backlog scope.
- [x] Start phase gating and high-priority implementation.
- [x] Centralize backend URL resolution behind a shared helper.
- [x] Replace hardcoded backend URL reads in screening, selected deal-room, and collaboration call sites.
- [x] Harden main chat textarea key/submission handling with explicit form semantics.
- [x] Expand backend URL fallback resolution to support legacy/env alias names.
- [x] Expand shared config usage to primary deal-room and collaboration integrations.
- [x] Add reusable onboarding component for empty states.
- [x] Implement improved empty states for Buyers, Deal Rooms, Workflows, and Saved Searches.
- [ ] Expand shared config usage to remaining peripheral callers.
- [ ] Implement all additional roadmap items.
- [x] Track ongoing roadmap progress in `docs/IMPLEMENTATION_ROADMAP_CUSTOM.md`.

## Detailed roadmap (from user review)

### P0 / Critical

1. Screening Pipeline — Configuration Missing
- Status: [x] Completed in this pass
- Code:
  - `apps/web/lib/backendConfig.ts` added with normalized env handling.
  - `apps/web/lib/screeningApi.ts` now reads from the shared backend config helper.
  - `apps/web/app/screening/intake/page.tsx` now validates config at action time.
  - `apps/web/app/screening/playbook/page.tsx` now validates config before API calls.
- Additional call sites now use shared helper:
  - `apps/web/components/copilot/CopilotPanel.tsx`
  - `apps/web/app/deal-room/[projectId]/page.tsx`
  - `apps/web/components/deal-room/CollaborativeMemo.tsx`
- Next:
  - Confirm deployment `.env` variable in prod/staging (updated root and web env templates).
  - Verify filters/listing still render after fix.
  - Set `NEXT_PUBLIC_BACKEND_URL` in production environment config.

2. Chat Input Behavior
- Status: [x] Completed in this pass
- Code:
  - `apps/web/components/chat/ChatInput.tsx` converted from raw keydown send flow to explicit form submit flow.
  - Enter handling now prevents accidental default action and routes through a submit handler.
  - Added deterministic controlled draft state and Enter stop-propagation to avoid accidental bubbling into unrelated handlers.
- Next:
  - Validate in browser that Enter no longer triggers route-level/default behavior.

### Operational note (2026-02-15)
- Backend config support was hardened by checking multiple env aliases when resolving the screening backend URL:
  - `NEXT_PUBLIC_BACKEND_URL`
  - `BACKEND_URL`
  - `NEXT_PUBLIC_SCREENING_BACKEND_URL`
  - `SCREENING_BACKEND_URL`

### Priority: High

3. Data Visualizations
- Status: [~] In progress
- Locations:
  - Portfolio analytics, command center timelines, market intel trend graphs, run dashboard.
- Implemented in this pass:
  - `apps/web/app/portfolio/page.tsx` (12-month deal + triage trend cards)
  - `apps/web/app/command-center/page.tsx` (deadline timeline view)
  - `apps/web/app/market/page.tsx` (comp trend bar charts)
  - `apps/web/app/runs/dashboard/page.tsx` (run duration and reliability trend cards)

4. Empty States + Onboarding
- Status: [x] In progress
- Locations:
  - Buyers, Deal Rooms, Workflows, Saved Searches.
- Implementation completed this pass:
  - New reusable onboarding component:
    - `apps/web/components/onboarding/GuidedOnboardingPanel.tsx`
  - Buyers:
    - `apps/web/app/buyers/page.tsx`
    - Added empty-state steps, clear onboarding path, and sample profile preload actions.
  - Deal Rooms:
    - `apps/web/app/deal-room/page.tsx`
    - Added onboarding steps, guided intake path, and sample room seed actions.
  - Workflows:
    - `apps/web/app/workflows/page.tsx`
    - Added onboarding steps for new users and one-click sample workflow seeding.
  - Saved Searches:
    - `apps/web/app/saved-searches/page.tsx`
    - Added onboarding steps, builder integration, and seeded preset creation actions.
- Remaining:
  - Add dedicated tutorial pages/videos for each onboarding flow.
  - Replace preset sample creators with richer guided templates and persisted user preferences.

5. Copilot Commands Documentation + Suggestions
- Status: [x] Started in this pass
- Completed pieces:
  - Added shared command schema in `apps/web/lib/copilotCommandLibrary.ts`.
  - Added operator-facing command documentation `docs/COPILOT_COMMANDS.md`.
  - Added command library suggestions/autocomplete + optional command library panel in `apps/web/components/copilot/CopilotPanel.tsx`.

### Priority: Medium

6. Improve Loading States
- Status: [~] In progress
- Started this pass in:
  - `apps/web/app/portfolio/page.tsx` (skeletons for main dashboard and chart-heavy panels during load)
  - `apps/web/app/market/page.tsx` (skeletons for parish dashboard stats/trends and feed)
  - `apps/web/app/runs/dashboard/page.tsx` (skeleton shell during dashboard bootstrap)

7. Export Functionality
- Status: [~] In progress
- Progress:
  - Implemented CSV export from deals page in `apps/web/app/deals/page.tsx` with guardrails for empty rows/in-flight export, BOM-safe encoding, and filename timestamping.
  - Implemented run history export from `apps/web/app/runs/dashboard/page.tsx` (recent runs + totals + confidence timeline, with UTC timestamped filename and CSV safety guards).
  - Implemented portfolio analytics report export from `apps/web/app/portfolio/page.tsx` (active deals + metrics + trend).
  - Implemented command-center report export from `apps/web/app/command-center/page.tsx` (briefing + pipeline + deadlines snapshot).
  - Remaining: evidence/export package downloads.

8. Enhanced Search
- Status: [ ] Planned

9. Bulk Operations
- Status: [ ] Planned

10. Mobile Responsiveness
- Status: [ ] Planned

### Priority: Nice-to-Have

11. Dark Mode Validation
- Status: [ ] Planned

12. Keyboard Navigation Enhancements
- Status: [ ] Planned

13. Activity Feed
- Status: [ ] Planned

14. Notification System
- Status: [ ] Planned

15. Collaboration Features
- Status: [ ] Planned

## Scope note

This pass moved forward from the two highest-impact blockers to include high-priority onboarding improvements on four empty sections.
- unblock Screening by making backend URL configuration explicit and centralized.
- prevent accidental input/action ambiguity in the main chat entry path.
- add guided onboarding for Buyers, Deal Rooms, Workflows, and Saved Searches.
