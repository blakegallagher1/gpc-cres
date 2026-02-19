# Entitlement OS Implementation Roadmap (User Review)

Last reviewed: 2026-02-19


Generated: 2026-02-15
Owner: Platform engineering + user review cadence
Current phase: High-priority enhancements (data visualization rollout and remaining core usability fixes)

## 1) Current Status Summary

- Core blockers: screening backend URL is now centralized and validated in key entry paths.
- Chat submit behavior: switched to explicit form handling to avoid accidental route interaction.
- Empty-state onboarding: reusable onboarding panel and custom flows now implemented across key empty sections.
- Copilot commands: command library + documentation + suggestion hooks are in place.
- Environment readiness: production/backend URL requirements now explicitly documented in root and web env templates.
- Next target: finish high-priority visual intelligence additions and then roll through adjacent execution items.

## 2) Execution Rules (applies to this roadmap)

1. Keep org-scoped behavior and existing auth boundaries unchanged.
2. Prioritize incremental, data-safe updates over broad refactors.
3. Add one vertical slice at a time and update this plan immediately after each code change.
4. For each item, validate UI fallback states (loading/empty/error) before marking complete.
5. Any new charting should be readable at mobile width and support low-data states.

## 3) Detailed Work Plan

### 3.1 P0 / Critical

- [x] **Screening Pipeline Configuration**
  - Files: `apps/web/lib/backendConfig.ts`, `apps/web/lib/screeningApi.ts`, `apps/web/app/screening/intake/page.tsx`, `apps/web/app/screening/playbook/page.tsx`, plus selected copilot/deal-room call sites
  - Definition of done:
    - `NEXT_PUBLIC_BACKEND_URL` is referenced through one shared helper.
    - User-facing error remains actionable and specific.
    - Existing screen filters/listing paths execute without URL/env null crashes.

- [x] **Chat Input Behavior**
  - Files: `apps/web/components/chat/ChatInput.tsx`
  - Definition of done:
    - Enter submits only chat message.
    - No route-level navigation or unintended submit side effects in normal typing.
    - Added stop-propagation guard + controlled draft state to prevent submit leakage while preserving Shift+Enter multiline behavior.

### 3.2 High Priority

- [x] **Empty States + Onboarding**
  - Files: `apps/web/components/onboarding/GuidedOnboardingPanel.tsx`, `apps/web/app/buyers/page.tsx`, `apps/web/app/deal-room/page.tsx`, `apps/web/app/workflows/page.tsx`, `apps/web/app/saved-searches/page.tsx`
  - Definition of done:
    - First-time and empty views include clear actions, contextual next steps, and confidence-building entry points.
    - Section-specific sample/seed option available.

- [x] **Copilot Command Documentation**
  - Files: `docs/COPILOT_COMMANDS.md`, `apps/web/lib/copilotCommandLibrary.ts`, `apps/web/components/copilot/CopilotPanel.tsx`
  - Definition of done:
    - New users can discover command examples without leaving the UI.
    - Suggested command list is visible and actionable in the command composer.

- [~] **Data Visualizations (in progress)**
  - [x] Portfolio Analytics pipeline trend cards
    - File: `apps/web/app/portfolio/page.tsx`
    - Adds:
      - 12-month deal count trend
      - 12-month average triage score trend
    - Update status: implemented
  - [x] Market Intel trend bars
    - File: `apps/web/app/market/page.tsx`
    - Adds:
      - $/SF trend bars
      - Cap-rate trend bars
      - Transaction count trend bars
    - Update status: implemented
  - [x] Command Center deadline timeline
    - File: `apps/web/app/command-center/page.tsx`
    - Adds:
      - Deadline buckets by due window for quick operational view
    - Update status: implemented
  - [x] Run Dashboard performance trend charts
    - File: `apps/web/app/runs/dashboard/page.tsx`
    - Adds:
      - Run duration trend (recent runs)
      - Run success trend (7-day view)
    - Update status: implemented
  - [ ] Portfolio deeper visualization variants
    - Potential additions:
      - Geo heat concentration trend by quarter
      - Pipeline aging and stage transition speed
  - [ ] Command Center pipeline timeline by day
    - Potential additions:
      - Stage movement events over time from existing automation stream

### 3.3 Medium Priority (next wave)

- [~] Improve loading states for heavy charts and cards
  - In progress:
    - Portfolio analytics main view and trend cards now use skeleton placeholders in loading state.
    - Market intelligence dashboard now uses skeleton placeholders for parish summary, trend fetch, and activity feed.
    - Run dashboard now uses skeleton dashboard shell and panel placeholders on bootstrap.
  - Candidate files: all pages touched above + chart-heavy components.
- [~] Add chart/report export and download support (partial)
  - Completed:
    - `apps/web/app/deals/page.tsx`: Added deals CSV export action with UTF-8 BOM, field escaping, filename timestamping, and disabled export states.
    - `apps/web/app/runs/dashboard/page.tsx`: Added run-history CSV export (recent runs + totals + confidence timeline) with in-flight state and safe escaping.
    - `apps/web/app/portfolio/page.tsx`: Added portfolio report export covering active deals, metrics, and trend snapshot.
    - `apps/web/app/command-center/page.tsx`: Added command-center export covering briefing sections, pipeline snapshot, and deadline timeline snapshot.
  - Remaining:
    - Evidence/export package downloads.
- [ ] Improve search results with previews and persistent recent searches.
- [ ] Add bulk operations in deal table and source list contexts.

### 3.4 Long Tail / Nice-to-Have

- [ ] Dark mode validation pass across all modified dashboard widgets.
- [ ] Keyboard navigation expansion and shortcut reference.
- [ ] Activity feed stream and per-user filtering.
- [ ] Notification bell and preference surfaces.
- [ ] Collaboration upgrades (`@mentions`, assignment alerts).

## 4) Update Log

### 2026-02-15 - Visualizations Sprint Started
- Added Portfolio trend cards to `apps/web/app/portfolio/page.tsx`.
- Added Market trend bars to `apps/web/app/market/page.tsx`.
- Added Command Center deadline timeline panel to `apps/web/app/command-center/page.tsx`.
- Added Run Dashboard performance and reliability trend cards to `apps/web/app/runs/dashboard/page.tsx`.
- Plan file created in docs and updated with live statuses.

### 2026-02-15 - Screening Configuration Operationalized
- Added `NEXT_PUBLIC_BACKEND_URL` documentation to `/.env.example` and `/apps/web/.env.example`.
- Updated `README.md` and `apps/web/README.md` onboarding docs to explicitly call out the production requirement.
- Status for screening blocker remains implemented in code and now explicitly documented for deployment setup.

### 2026-02-15 - Loading State Improvements
- Added loading skeletons for:
  - `apps/web/app/portfolio/page.tsx` portfolio header, summary row, trend cards, and table shell.
  - `apps/web/app/market/page.tsx` parish summary/trend placeholders and recent activity feed placeholders.
  - `apps/web/app/runs/dashboard/page.tsx` dashboard skeleton shell for long-running metric hydration plus a loading progress indicator + warm-up ETA note.

### 2026-02-15 - Screening Env + Chat Input Hardening
- Expanded backend URL resolution in `apps/web/lib/backendConfig.ts` to check deployment aliases:
  - `NEXT_PUBLIC_BACKEND_URL`
  - `BACKEND_URL`
  - `NEXT_PUBLIC_SCREENING_BACKEND_URL`
  - `SCREENING_BACKEND_URL`
- Updated `apps/web/components/chat/ChatInput.tsx` with:
  - controlled draft state for deterministic submits,
  - Enter key stop-propagation to avoid unrelated key listeners being triggered,
  - preserved multiline input via Shift+Enter.

### 2026-02-15 - Deals CSV Export Implemented
- Added `handleExportDeals` in `apps/web/app/deals/page.tsx`.
- Added a toolbar action (download icon) with in-flight/inventory guards and direct browser CSV download.
- Export output now uses UTF-8 BOM and stable field escaping to improve downstream opening in spreadsheet tools.

### 2026-02-15 - Run History Export Added
- Added `handleExportRunHistory` in `apps/web/app/runs/dashboard/page.tsx`.
- Added run history export action in the page header (refresh + export buttons) with in-flight indicator and toast feedback.
- Exported sections:
  - recent runs snapshot,
  - dashboard totals,
  - confidence timeline.

### 2026-02-15 - Portfolio Analytics Report Export Added
- Added `handleExportPortfolioReport` in `apps/web/app/portfolio/page.tsx`.
- Added export action in the page header with in-flight/disabled states.
- Export output includes:
  - active deal snapshot (deal-level rows),
  - portfolio metrics and dimensions,
  - pipeline trend rows.

### 2026-02-15 - Command Center Report Export Added
- Added `handleExportCommandCenter` in `apps/web/app/command-center/page.tsx`.
- Added command-center export button in the header next to refresh.
- Export output includes briefing sections, pipeline snapshot, and deadline events.

## 5) Risks to track before completion

- Some trend data is derived from current API payload shapes; if backend payload contracts change, chart behavior must adjust with graceful fallbacks.
- Deadline and run trend views rely on timestamp fields being parseable ISO strings.
- No backend aggregation endpoint changes introduced in this pass; if future volumes grow, we may move chart calculations server-side for performance.
