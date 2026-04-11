# macOS App Enhancement — Design

**Date:** 2026-04-11
**Status:** Approved
**Branch:** codex/macos-operator-app

## Problem

The macOS app (`apps/macos/`) is a partial wrapper around gallagherpropco.com. It has:
- 16 sidebar routes but several don't exist in the production nav (Evidence, Buyers, Screening as top-level)
- Missing routes: `/wealth`, `/notifications`, `/proactive`, `/settings`
- 8 of 16 routes use a catch-all `OverviewPane` showing the same generic metric grid
- 5 routes use `MemoryPane` — functionally identical to each other
- No native macOS capabilities (dock badge, menu bar, notifications, command palette)

The user wants the macOS app to be a complete, polished desktop client for gallagherpropco.com. All data (chats, deals, runs, tasks) must write to the same database regardless of whether access is via the macOS app or the browser.

## Constraints

- **No changes to the web application** — gallagherpropco.com is untouched
- The WebView IS the production app — it renders gallagherpropco.com exactly
- Auth flows through the existing WKWebView shared cookie store — already correct
- All API calls use the shared session token already in `APIClient`
- Build commands stay: `swift build` in `apps/macos/`, `./script/build_and_run.sh --verify`

## Architecture

The macOS app is a native shell (SwiftUI + AppKit) wrapping a WKWebView that loads gallagherpropco.com. The native layer provides:

1. **Sidebar navigation** — all production routes accessible, organized as production nav
2. **Inspector panes** — right-side panel showing live data per route, pulled from the same production APIs via the shared auth token
3. **Native OS capabilities** — dock badge, menu bar, notifications, command palette

Data sharing is automatic: the WebView calls the same API as the browser. Nothing new is needed for data consistency.

```
┌─────────────────────────────────────────────────────────┐
│  macOS App                                              │
│  ┌──────────┐  ┌────────────────────┐  ┌─────────────┐ │
│  │ Sidebar  │  │    WKWebView       │  │  Inspector  │ │
│  │          │  │  gallagherpropco   │  │   Pane      │ │
│  │ All 13   │  │  .com (full app)   │  │  (per-route │ │
│  │ routes   │  │                    │  │   live data)│ │
│  └──────────┘  └────────────────────┘  └─────────────┘ │
│                        │  Auth: WKWebView shared cookies │
│                        ▼                                │
│              gallagherpropco.com API                    │
│              (same DB as browser)                       │
└─────────────────────────────────────────────────────────┘
```

## Agent 1 — Route & Sidebar Completeness

**Scope:** `DesktopModels.swift`, `SidebarView.swift`, `ContentView.swift`, `AppStore.swift`, `README.md`

### Sidebar Reorganization

Production web nav has 13 routes in 4 groups. Align macOS sidebar to match:

| Section | Routes |
|---------|--------|
| Pinned | Chat |
| Operate | Command Center, Deals, Map |
| Intelligence | Opportunities, Market, Portfolio, Wealth |
| System | Agents, Runs, Automation, Workflows, Reference |
| Footer | Settings (web `/settings`), Admin |

**Remove as top-level:** Evidence, Buyers, Screening (these are deal sub-surfaces, not top-level nav on the web app)

**Add:** `/wealth`, `/notifications` (accessible from menu bar popover), `/settings` (loads web `/settings`, distinct from macOS preferences window)

### DesktopRoute Changes

```swift
// Add
case wealth        // "/wealth"
case settings      // "/settings"  (web settings, not macOS prefs)

// Remove from top-level sidebar (keep enum cases for deep linking)
// case evidence, buyers, screening — moved to deal sub-navigation
```

### Other Changes
- `migrateBaseURLIfNeeded` already handles localhost→production migration — keep
- Fix README: change `http://localhost:3000` → `https://gallagherpropco.com`
- Ensure `AppStore.applySignedOutDesktopState()` covers new routes

---

## Agent 2 — Route-Specific Inspector Panes

**Scope:** `DetailViews.swift`, `DesktopModels.swift`, `APIClient.swift`

Replace every catch-all `OverviewPane`/`MemoryPane` with a dedicated inspector pane. All panes use the existing `SurfaceCard`/`MetricCard` design system.

### New Pane Assignments

| Route | Pane | Data Source | Key Metrics |
|-------|------|-------------|-------------|
| `.chat` | `ChatPane` | `/api/chat/` (list conversations) | Active conversations, messages today, last active agent |
| `.commandCenter` | `CommandCenterPane` | `/api/memory/stats`, `/api/intelligence/daily-briefing` | Memory collision count, innovation queue depth, drift alerts |
| `.deals` | `DealsPane` (enrich existing) | `/api/deals` (already called) | Stage distribution donut, recent deal, avg score |
| `.map` | `MapPane` (enrich existing) | `/api/map/workspaces/active` (already called) | Active workspace, parcel count, active overlays |
| `.opportunities` | `OpportunitiesPane` | `/api/parcels/?limit=5&sort=score` | Top scored parcels, screened today, avg score |
| `.market` | `MarketPane` | `/api/intelligence/daily-briefing` | Briefing date, alert count, monitored corridors |
| `.portfolio` | `PortfolioPane` | `/api/portfolio/analytics` | Property count, total value, debt alerts |
| `.wealth` | `WealthPane` | `/api/wealth/` | Net worth, entity count, tax alerts |
| `.agents` | `AgentsPane` | `/api/runs/dashboard` (already called) | Active agents, last run per agent, error count |
| `.runs` | `RunsPane` (enrich existing) | `/api/runs/dashboard` (already called) | Add success rate, avg duration, tool call count |
| `.automation` | `AutomationPane` (enrich existing) | `/api/automation/events` (already called) | Cron health, event counts by type, last fire |
| `.workflows` | `WorkflowsPane` | `/api/workflows/` | Active workflows, last run status |
| `.reference` | `ReferencePane` | `/api/intelligence/daily-briefing` | Parish data freshness, last ingest date |
| `.admin` | `AdminPane` | `/api/admin/stats`, `/api/health/detailed` | System health, sentinel alerts, DB status |

### New Model Types

```swift
struct ChatSnapshot { conversations: Int, messagesToday: Int, lastAgent: String }
struct CommandCenterSnapshot { collisions: Int, innovationQueue: Int, driftAlerts: Int }
struct OpportunitiesSnapshot { topParcels: [ParcelSummary], screenedToday: Int, avgScore: Double }
struct MarketSnapshot { briefingDate: String, alertCount: Int, corridors: [String] }
struct PortfolioSnapshot { propertyCount: Int, totalValue: String, debtAlerts: Int }
struct WealthSnapshot { netWorth: String, entityCount: Int, taxAlerts: Int }
struct AgentsSnapshot { activeCount: Int, lastRunByAgent: [String: String], errorCount: Int }
struct WorkflowsSnapshot { activeCount: Int, lastRunStatus: String }
struct AdminSnapshot { dbStatus: String, sentinelAlerts: Int, containerHealth: String }
```

### APIClient Additions

New fetch methods for each new pane, following the existing `fetchJSONUsingPageSession` pattern (uses WebView session cookies — no new auth needed).

---

## Agent 3 — Native macOS Capabilities

**Scope:** New files: `MenuBarController.swift`, `NotificationManager.swift`, `CommandPalette.swift`. Modifications: `GallagherCresMacOSApp.swift`, `AppStore.swift`, `ContentView.swift`

### Dock Badge
- Count = unread notifications + active run count
- Refreshed every 60s via existing `AppStore` refresh cycle
- `NSApp.dockTile.badgeLabel = count > 0 ? "\(count)" : nil`

### Menu Bar Status Item
- `NSStatusBar.system.statusItem` with connectivity icon
- Mini popover: connectivity state, unread count, quick-jump list of all sidebar routes
- Dismisses on click outside

### Native Notifications (UserNotifications)
- `UNUserNotificationCenter.current().requestAuthorization` on first launch
- Fire notifications for:
  - Deal stage change (from automation events polling)
  - Run completed/failed (from runs polling)
  - Sentinel alert (from admin health polling)
- Notification tap deep-links to relevant route in the app

### Cmd+K Command Palette
- `NSPanel` overlay (key window, bezel style)
- `NSSearchField` + filtered `NSTableView` of all `DesktopRoute` cases
- Fuzzy match on route title and path
- Return/click navigates WebView to selected route
- Esc dismisses

### Window State Persistence
- Save/restore selected route, window frame in `UserDefaults`
- Restore on launch before first WebView load

### Inspector Collapse Toggle
- Toolbar button toggles `NativeInspectorPane` visibility
- Animates with `withAnimation(.easeInOut(duration: 0.2))`
- State persisted in `UserDefaults`

### File Drag-Drop
- `WKWebView` already receives drag events from the OS
- Intercept `.drop` modifier on `DesktopWebView` when route is `/deals` or `/uploads`
- Forward dropped file URLs to the WebView's upload zone via JS: `document.querySelector('input[type=file]').files = ...`

### Keyboard Route Shortcuts
- `Cmd+1` → Chat, `Cmd+2` → Command Center, ... `Cmd+N` for first N routes
- Registered in `DesktopCommands` as additional `KeyboardShortcut` modifiers

---

## Build & Verification

No new dependencies. All work is pure Swift (SwiftUI + AppKit + WebKit + UserNotifications).

```bash
cd apps/macos && swift build          # must pass after each agent
./script/build_and_run.sh --verify    # launch check
./script/build_and_run.sh --logs      # verify no new error patterns in log stream
```

Each agent runs `swift build` after every file change and resolves any type errors before moving on.

## Success Criteria

- All production routes reachable from the sidebar
- Every route has a dedicated inspector pane showing live data (no OverviewPane catch-alls)
- Dock badge reflects unread + active run count
- Cmd+K palette navigates to any route in <2 keystrokes
- Native notifications fire for deal changes, run completions, sentinel alerts
- `swift build` passes clean with zero warnings introduced
- All data (chats, deals, runs) continues to write to the same DB regardless of access path
