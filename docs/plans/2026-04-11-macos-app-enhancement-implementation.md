# macOS App Enhancement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the macOS app a complete, polished native wrapper for gallagherpropco.com — all production routes accessible, per-route inspector panes with live data, and native macOS capabilities (dock badge, menu bar, notifications, Cmd+K palette).

**Architecture:** WebView renders gallagherpropco.com exactly as-is. The native shell adds sidebar navigation, per-route inspector panes that call the same production APIs via the shared auth token, and native OS capabilities. No web app changes. All data writes (chats, deals, runs) continue through the production API — same DB regardless of access path.

**Tech Stack:** Swift 5.10, SwiftUI, AppKit, WebKit (WKWebView), UserNotifications, Foundation. SPM package at `apps/macos/`. No third-party dependencies.

**Build command (run after every task):** `cd apps/macos && swift build`

**Verify launch:** `./script/build_and_run.sh --verify` from repo root

---

## AGENT 1 — Route & Sidebar Completeness

**Files touched:**
- Modify: `apps/macos/Sources/Models/DesktopModels.swift`
- Modify: `apps/macos/Sources/Views/SidebarView.swift`
- Modify: `apps/macos/Sources/Views/ContentView.swift` (DesktopCommands + routeInspectorBody)
- Modify: `apps/macos/Sources/Stores/AppStore.swift` (applySignedOutDesktopState + refreshNativeData switch)
- Modify: `apps/macos/README.md`

---

### Task 1: Add missing DesktopRoute cases

**File:** `apps/macos/Sources/Models/DesktopModels.swift`

**Context:** The production web app has routes for `/wealth` and `/settings` that are not in the enum. `evidence`, `buyers`, `screening` exist in the enum but are deal sub-surfaces on the web — keep their enum cases (needed for deep linking) but remove them from the top-level sidebar in Task 2.

**Step 1: Add `.wealth` and `.settings` cases to the enum**

In `DesktopModels.swift`, add `wealth` and `settings` after `portfolio` (line 14). The full updated enum block:

```swift
enum DesktopRoute: String, CaseIterable, Identifiable {
    case commandCenter
    case chat
    case deals
    case map
    case opportunities
    case workflows
    case runs
    case agents
    case automation
    case market
    case portfolio
    case wealth
    case evidence
    case buyers
    case screening
    case reference
    case admin
    case settings
```

**Step 2: Add `title` cases for new routes**

In the `title` switch, add after `case .portfolio`:
```swift
case .wealth: "Wealth"
case .settings: "Settings"
```

**Step 3: Add `subtitle` cases for new routes**

After `case .portfolio: "Portfolio analytics and stress"`:
```swift
case .wealth: "Net worth, entities, and tax"
case .settings: "User preferences and configuration"
```

**Step 4: Add `systemImage` cases for new routes**

After `case .portfolio: "briefcase"`:
```swift
case .wealth: "chart.pie"
case .settings: "gear"
```

**Step 5: Add `path` cases for new routes**

After `case .portfolio: "/portfolio"`:
```swift
case .wealth: "/wealth"
case .settings: "/settings"
```

**Step 6: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED, zero errors.

**Step 7: Commit**

```bash
git add apps/macos/Sources/Models/DesktopModels.swift
git commit -m "feat(macos): add wealth and settings routes to DesktopRoute"
```

---

### Task 2: Reorganize sidebar to match production nav

**File:** `apps/macos/Sources/Views/SidebarView.swift`

**Context:** Production web nav has 5 groups: Pinned (Chat), Operate (Command Center, Deals, Map), Intelligence (Opportunities, Market, Portfolio, Wealth), System (Agents, Runs, Automation, Workflows, Reference), Footer (Settings, Admin). Evidence/Buyers/Screening are removed from top-level sidebar.

**Step 1: Replace SidebarView body with production-aligned sections**

Replace the entire `SidebarView.swift` content:

```swift
import SwiftUI

struct SidebarView: View {
    @Bindable var store: AppStore

    private let pinnedRoutes: [DesktopRoute] = [.chat]

    private let operateRoutes: [DesktopRoute] = [
        .commandCenter, .deals, .map
    ]

    private let intelligenceRoutes: [DesktopRoute] = [
        .opportunities, .market, .portfolio, .wealth
    ]

    private let systemRoutes: [DesktopRoute] = [
        .agents, .runs, .automation, .workflows, .reference
    ]

    private let footerRoutes: [DesktopRoute] = [.settings, .admin]

    var body: some View {
        List(selection: $store.selectedRoute) {
            Section("Pinned") {
                routeRows(pinnedRoutes)
            }

            Section("Operate") {
                routeRows(operateRoutes)
            }

            Section("Intelligence") {
                routeRows(intelligenceRoutes)
            }

            Section("System") {
                routeRows(systemRoutes)
            }

            Section("") {
                routeRows(footerRoutes)
            }

            Section("Environment") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(store.endpointConfiguration.baseURL)
                        .font(.callout)
                        .lineLimit(1)

                    Text(store.currentURLString.isEmpty ? store.endpointConfiguration.startPath : store.currentURLString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .padding(.vertical, 4)
            }
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private func routeRows(_ routes: [DesktopRoute]) -> some View {
        ForEach(routes) { route in
            Button {
                store.select(route: route)
            } label: {
                SidebarRow(route: route, isSelected: store.selectedRoute == route)
            }
            .buttonStyle(.plain)
            .tag(route)
        }
    }
}

private struct SidebarRow: View {
    let route: DesktopRoute
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: route.systemImage)
                .frame(width: 16)
                .foregroundStyle(isSelected ? .primary : .secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(route.title)
                    .lineLimit(1)

                Text(route.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}
```

**Step 2: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED.

**Step 3: Commit**

```bash
git add apps/macos/Sources/Views/SidebarView.swift
git commit -m "feat(macos): reorganize sidebar to match production nav structure"
```

---

### Task 3: Update AppStore for new routes

**File:** `apps/macos/Sources/Stores/AppStore.swift`

**Context:** `refreshNativeData()` has a switch on `selectedRoute` that needs cases for `wealth` and `settings`. `applySignedOutDesktopState()` needs to initialize new data properties. We'll add stub properties now; Agent 2 will populate them with real data.

**Step 1: Add new snapshot properties to AppStore**

After line 21 (`var automationRecords: [AutomationRecord] = []`), add:

```swift
    var chatSnapshot = ChatSnapshot.placeholder
    var commandCenterSnapshot = CommandCenterSnapshot.placeholder
    var opportunitiesSnapshot = OpportunitiesSnapshot.placeholder
    var marketSnapshot = MarketSnapshot.placeholder
    var portfolioSnapshot = PortfolioSnapshot.placeholder
    var wealthSnapshot = WealthSnapshot.placeholder
    var agentsSnapshot = AgentsSnapshot.placeholder
    var workflowsSnapshot = WorkflowsSnapshot.placeholder
    var adminSnapshot = AdminSnapshot.placeholder
    var inspectorCollapsed = false
```

**Note:** These types will be added to `DesktopModels.swift` in Agent 2 Task 1. For now, just declare the properties — the build will fail until Agent 2 adds the types. Agent 1 adds the property declarations here as a stub; Agent 2 resolves them.

**Step 2: Update refreshNativeData switch for new routes**

Replace the existing `switch selectedRoute` block in `refreshNativeData()` (lines 159-172):

```swift
            switch selectedRoute {
            case .deals:
                dealRecords = try await client.fetchDeals()
            case .runs:
                runRecords = try await client.fetchRuns()
            case .map:
                mapRecord = try await client.fetchMapRecord()
            case .automation:
                automationRecords = try await client.fetchAutomationRecords()
            case .chat:
                chatSnapshot = try await client.fetchChatSnapshot()
            case .commandCenter:
                commandCenterSnapshot = try await client.fetchCommandCenterSnapshot()
            case .opportunities:
                opportunitiesSnapshot = try await client.fetchOpportunitiesSnapshot()
            case .market:
                marketSnapshot = try await client.fetchMarketSnapshot()
            case .portfolio:
                portfolioSnapshot = try await client.fetchPortfolioSnapshot()
            case .wealth:
                wealthSnapshot = try await client.fetchWealthSnapshot()
            case .agents:
                agentsSnapshot = try await client.fetchAgentsSnapshot()
            case .workflows:
                workflowsSnapshot = try await client.fetchWorkflowsSnapshot()
            case .admin:
                adminSnapshot = try await client.fetchAdminSnapshot()
            case .reference:
                operatorSnapshot = await client.fetchDashboardSnapshot()
            case .settings, .evidence, .buyers, .screening:
                break // WebView-only routes — no native data needed
            }
```

**Step 3: Update applySignedOutDesktopState to zero new properties**

In `applySignedOutDesktopState()`, after `mapRecord = MapRecord.placeholder`, add:

```swift
        chatSnapshot = ChatSnapshot.placeholder
        commandCenterSnapshot = CommandCenterSnapshot.placeholder
        opportunitiesSnapshot = OpportunitiesSnapshot.placeholder
        marketSnapshot = MarketSnapshot.placeholder
        portfolioSnapshot = PortfolioSnapshot.placeholder
        wealthSnapshot = WealthSnapshot.placeholder
        agentsSnapshot = AgentsSnapshot.placeholder
        workflowsSnapshot = WorkflowsSnapshot.placeholder
        adminSnapshot = AdminSnapshot.placeholder
```

**Step 4: Add inspector collapse toggle method**

At the end of the public method section, before `var allowedHost`, add:

```swift
    func toggleInspector() {
        inspectorCollapsed.toggle()
        defaults.set(inspectorCollapsed, forKey: Keys.inspectorCollapsed)
    }
```

**Step 5: Add Keys.inspectorCollapsed**

In the `enum Keys` block:
```swift
        static let inspectorCollapsed = "gallagher-cres.macos.inspectorCollapsed"
```

**Step 6: Restore inspectorCollapsed from UserDefaults in init**

After `customPath = startPath` in `init()`, add:
```swift
        inspectorCollapsed = defaults.bool(forKey: Keys.inspectorCollapsed)
```

**Step 7: Build (will fail — types not yet added)**

```bash
cd apps/macos && swift build
```

Expected: ERRORS about missing types (ChatSnapshot, etc.) and missing APIClient methods. This is expected — Agent 2 resolves them. Commit current state anyway as a clear hand-off.

**Step 8: Commit**

```bash
git add apps/macos/Sources/Stores/AppStore.swift
git commit -m "feat(macos): wire new route cases and inspector collapse into AppStore (pending Agent 2 types)"
```

---

### Task 4: Update ContentView inspector routing and collapse toggle

**File:** `apps/macos/Sources/Views/ContentView.swift`

**Step 1: Add inspector collapse toggle button to toolbar**

In the right `ToolbarItemGroup` (after the "Refresh Desktop Data" button, line 73), add:

```swift
                Button {
                    store.toggleInspector()
                } label: {
                    Label(store.inspectorCollapsed ? "Show Inspector" : "Hide Inspector",
                          systemImage: store.inspectorCollapsed ? "sidebar.right" : "sidebar.right.fill")
                }
                .keyboardShortcut("i", modifiers: [.command, .option])
```

**Step 2: Wrap NativeInspectorPane in conditional visibility**

In the `detail` closure, replace:
```swift
            HSplitView {
                webWorkspace
                    .frame(minWidth: 760, maxWidth: .infinity, maxHeight: .infinity)

                NativeInspectorPane(store: store)
                    .frame(minWidth: 320, idealWidth: 360, maxWidth: 440, maxHeight: .infinity)
            }
```

With:
```swift
            HSplitView {
                webWorkspace
                    .frame(minWidth: 760, maxWidth: .infinity, maxHeight: .infinity)

                if store.inspectorCollapsed == false {
                    NativeInspectorPane(store: store)
                        .frame(minWidth: 320, idealWidth: 360, maxWidth: 440, maxHeight: .infinity)
                        .transition(.move(edge: .trailing))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: store.inspectorCollapsed)
```

**Step 3: Update routeInspectorBody switch for all new routes**

Replace the entire `routeInspectorBody` computed property (lines 227-250):

```swift
    @ViewBuilder
    private var routeInspectorBody: some View {
        switch store.selectedRoute {
        case .chat:
            ChatPane(snapshot: store.chatSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .commandCenter:
            CommandCenterPane(snapshot: store.commandCenterSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .deals:
            if store.dealRecords.isEmpty, store.isRefreshingNativeData == false {
                EmptyInspectorState(message: "No deal records have been loaded yet.")
            } else {
                DealsPane(records: store.dealRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
            }
        case .map:
            MapPane(record: store.mapRecord, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .opportunities:
            OpportunitiesPane(snapshot: store.opportunitiesSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .market:
            MarketPane(snapshot: store.marketSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .portfolio:
            PortfolioPane(snapshot: store.portfolioSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .wealth:
            WealthPane(snapshot: store.wealthSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .agents:
            AgentsPane(snapshot: store.agentsSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .runs:
            if store.runRecords.isEmpty, store.isRefreshingNativeData == false {
                EmptyInspectorState(message: "No run records have been loaded yet.")
            } else {
                RunsPane(records: store.runRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
            }
        case .automation:
            AutomationPane(records: store.automationRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .workflows:
            WorkflowsPane(snapshot: store.workflowsSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .reference:
            OverviewPane(snapshot: store.operatorSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .admin:
            AdminPane(snapshot: store.adminSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .settings, .evidence, .buyers, .screening:
            OverviewPane(snapshot: store.operatorSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        }
    }
```

**Step 4: Update DesktopCommands Navigate menu**

The Navigate menu uses `ForEach(DesktopRoute.allCases)` which auto-includes new routes. Add keyboard shortcuts for the top routes. Replace the `CommandMenu("Navigate")` block:

```swift
        CommandMenu("Navigate") {
            Button("Chat") { store.select(route: .chat) }
                .keyboardShortcut("1", modifiers: .command)
            Button("Command Center") { store.select(route: .commandCenter) }
                .keyboardShortcut("2", modifiers: .command)
            Button("Deals") { store.select(route: .deals) }
                .keyboardShortcut("3", modifiers: .command)
            Button("Map") { store.select(route: .map) }
                .keyboardShortcut("4", modifiers: .command)
            Button("Opportunities") { store.select(route: .opportunities) }
                .keyboardShortcut("5", modifiers: .command)
            Button("Runs") { store.select(route: .runs) }
                .keyboardShortcut("6", modifiers: .command)
            Button("Automation") { store.select(route: .automation) }
                .keyboardShortcut("7", modifiers: .command)
            Button("Portfolio") { store.select(route: .portfolio) }
                .keyboardShortcut("8", modifiers: .command)
            Button("Wealth") { store.select(route: .wealth) }
                .keyboardShortcut("9", modifiers: .command)
            Divider()
            ForEach(DesktopRoute.allCases) { route in
                Button(route.title) { store.select(route: route) }
            }
        }
```

**Step 5: Build (still fails pending Agent 2 types)**

```bash
cd apps/macos && swift build
```

Expected: ERRORS about missing pane types (ChatPane, CommandCenterPane, etc.). Expected — Agent 2 resolves.

**Step 6: Commit**

```bash
git add apps/macos/Sources/Views/ContentView.swift
git commit -m "feat(macos): wire all new routes into inspector routing and add collapse toggle"
```

---

### Task 5: Fix README

**File:** `apps/macos/README.md`

**Step 1: Update default base URL**

Find and replace `http://localhost:3000` with `https://gallagherpropco.com`.

**Step 2: Build + commit**

```bash
cd apps/macos && swift build
git add apps/macos/README.md
git commit -m "docs(macos): fix stale localhost URL in README"
```

---

## AGENT 2 — Route-Specific Inspector Panes

**Files touched:**
- Modify: `apps/macos/Sources/Models/DesktopModels.swift` (add new snapshot types)
- Modify: `apps/macos/Sources/Services/APIClient.swift` (add fetch methods)
- Modify: `apps/macos/Sources/Views/DetailViews.swift` (add new pane views)

**Prerequisite:** Agent 1 tasks 1–4 must be committed before Agent 2 starts, so the AppStore property declarations and switch cases exist.

---

### Task 1: Add new snapshot model types

**File:** `apps/macos/Sources/Models/DesktopModels.swift`

Add these structs after the existing `AutomationRecord` struct (end of file):

```swift
// MARK: - Per-route snapshot types

struct ChatSnapshot: Equatable {
    var conversationCount: Int
    var messagesToday: Int
    var lastActiveAgent: String

    static let placeholder = ChatSnapshot(
        conversationCount: 0,
        messagesToday: 0,
        lastActiveAgent: "—"
    )
}

struct CommandCenterSnapshot: Equatable {
    var collisions: Int
    var innovationQueueDepth: Int
    var driftAlerts: Int
    var briefingDate: String

    static let placeholder = CommandCenterSnapshot(
        collisions: 0,
        innovationQueueDepth: 0,
        driftAlerts: 0,
        briefingDate: "—"
    )
}

struct OpportunitiesSnapshot: Equatable {
    var screenedCount: Int
    var topParcelAddresses: [String]
    var avgScore: String

    static let placeholder = OpportunitiesSnapshot(
        screenedCount: 0,
        topParcelAddresses: [],
        avgScore: "—"
    )
}

struct MarketSnapshot: Equatable {
    var briefingDate: String
    var alertCount: Int
    var monitoredCorridors: [String]

    static let placeholder = MarketSnapshot(
        briefingDate: "—",
        alertCount: 0,
        monitoredCorridors: []
    )
}

struct PortfolioSnapshot: Equatable {
    var propertyCount: Int
    var totalValueLabel: String
    var debtAlerts: Int

    static let placeholder = PortfolioSnapshot(
        propertyCount: 0,
        totalValueLabel: "—",
        debtAlerts: 0
    )
}

struct WealthSnapshot: Equatable {
    var netWorthLabel: String
    var entityCount: Int
    var taxAlerts: Int

    static let placeholder = WealthSnapshot(
        netWorthLabel: "—",
        entityCount: 0,
        taxAlerts: 0
    )
}

struct AgentsSnapshot: Equatable {
    var activeCount: Int
    var errorCount: Int
    var lastRunLabels: [String]

    static let placeholder = AgentsSnapshot(
        activeCount: 0,
        errorCount: 0,
        lastRunLabels: []
    )
}

struct WorkflowsSnapshot: Equatable {
    var activeCount: Int
    var lastRunStatus: String

    static let placeholder = WorkflowsSnapshot(
        activeCount: 0,
        lastRunStatus: "—"
    )
}

struct AdminSnapshot: Equatable {
    var dbStatus: String
    var sentinelAlerts: Int
    var containerHealth: String

    static let placeholder = AdminSnapshot(
        dbStatus: "—",
        sentinelAlerts: 0,
        containerHealth: "—"
    )
}
```

**Build:**
```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED (types are now defined, AppStore properties compile).

**Commit:**
```bash
git add apps/macos/Sources/Models/DesktopModels.swift
git commit -m "feat(macos): add per-route snapshot model types"
```

---

### Task 2: Add APIClient fetch methods

**File:** `apps/macos/Sources/Services/APIClient.swift`

Add these methods after `fetchAutomationRecords()` (line 78). Each method uses `requestJSON(path:)` which already handles WebView session auth + URLSession fallback — no new auth logic needed.

```swift
    func fetchChatSnapshot() async throws -> ChatSnapshot {
        let payload = try await requestJSON(path: "/api/chat/conversations?limit=50")
        let items = APIParsers.extractPublicItems(from: payload)
        let today = Calendar.current.startOfDay(for: Date())
        let messagesToday = items.filter { item in
            guard let updatedAt = APIParsers.publicString(in: item, keys: ["updatedAt", "lastMessageAt", "createdAt"]),
                  let date = ISO8601DateFormatter().date(from: updatedAt) else { return false }
            return date >= today
        }.count
        let lastAgent = APIParsers.publicString(in: items.first ?? [:], keys: ["agentName", "agent", "title"]) ?? "—"
        return ChatSnapshot(conversationCount: items.count, messagesToday: messagesToday, lastActiveAgent: lastAgent)
    }

    func fetchCommandCenterSnapshot() async throws -> CommandCenterSnapshot {
        let briefing = (try? await requestJSON(path: "/api/intelligence/daily-briefing")) ?? [:]
        let stats = (try? await requestJSON(path: "/api/memory/stats")) ?? [:]
        let briefingDate = APIParsers.publicString(in: briefing as? [String: Any] ?? [:], keys: ["date", "generatedAt"]) ?? "—"
        let alerts = (briefing as? [String: Any]).flatMap { $0["alerts"] as? [[String: Any]] }?.count ?? 0
        let collisions = (stats as? [String: Any]).flatMap { $0["collisions"] as? Int } ?? 0
        let queueDepth = (stats as? [String: Any]).flatMap { $0["innovationQueue"] as? Int } ?? 0
        return CommandCenterSnapshot(collisions: collisions, innovationQueueDepth: queueDepth, driftAlerts: alerts, briefingDate: briefingDate)
    }

    func fetchOpportunitiesSnapshot() async throws -> OpportunitiesSnapshot {
        let payload = try await requestJSON(path: "/api/parcels?limit=5&sort=score&order=desc")
        let items = APIParsers.extractPublicItems(from: payload)
        let addresses = items.compactMap { APIParsers.publicString(in: $0, keys: ["address", "siteAddress", "parcelAddress"]) }
        let scores = items.compactMap { ($0["score"] as? Double) ?? ($0["triageScore"] as? Double) }
        let avg = scores.isEmpty ? "—" : String(format: "%.1f", scores.reduce(0, +) / Double(scores.count))
        return OpportunitiesSnapshot(screenedCount: items.count, topParcelAddresses: Array(addresses.prefix(3)), avgScore: avg)
    }

    func fetchMarketSnapshot() async throws -> MarketSnapshot {
        let briefing = (try? await requestJSON(path: "/api/intelligence/daily-briefing")) ?? [:]
        let dict = briefing as? [String: Any] ?? [:]
        let date = APIParsers.publicString(in: dict, keys: ["date", "generatedAt"]) ?? "—"
        let alerts = (dict["alerts"] as? [[String: Any]])?.count ?? 0
        let corridors = (dict["corridors"] as? [String]) ?? (dict["areas"] as? [String]) ?? []
        return MarketSnapshot(briefingDate: date, alertCount: alerts, monitoredCorridors: Array(corridors.prefix(5)))
    }

    func fetchPortfolioSnapshot() async throws -> PortfolioSnapshot {
        let payload = (try? await requestJSON(path: "/api/portfolio/analytics")) ?? [:]
        let dict = payload as? [String: Any] ?? [:]
        let count = dict["propertyCount"] as? Int ?? (dict["total"] as? Int) ?? 0
        let value = APIParsers.publicString(in: dict, keys: ["totalValue", "totalValueFormatted", "portfolioValue"]) ?? "—"
        let alerts = dict["debtAlerts"] as? Int ?? (dict["alerts"] as? Int) ?? 0
        return PortfolioSnapshot(propertyCount: count, totalValueLabel: value, debtAlerts: alerts)
    }

    func fetchWealthSnapshot() async throws -> WealthSnapshot {
        let payload = (try? await requestJSON(path: "/api/wealth")) ?? [:]
        let dict = payload as? [String: Any] ?? [:]
        let netWorth = APIParsers.publicString(in: dict, keys: ["netWorth", "netWorthFormatted", "totalNetWorth"]) ?? "—"
        let entities = dict["entityCount"] as? Int ?? (dict["entities"] as? [[String: Any]])?.count ?? 0
        let taxAlerts = dict["taxAlerts"] as? Int ?? 0
        return WealthSnapshot(netWorthLabel: netWorth, entityCount: entities, taxAlerts: taxAlerts)
    }

    func fetchAgentsSnapshot() async throws -> AgentsSnapshot {
        let payload = try await requestJSON(path: "/api/runs/dashboard")
        let items = APIParsers.extractPublicItems(from: payload)
        let active = items.filter { ($0["status"] as? String)?.lowercased() == "running" }.count
        let errors = items.filter {
            let s = ($0["status"] as? String)?.lowercased() ?? ""
            return s == "failed" || s == "error"
        }.count
        let labels = items.prefix(3).compactMap { item -> String? in
            guard let title = APIParsers.publicString(in: item, keys: ["title", "agent", "name"]),
                  let status = APIParsers.publicString(in: item, keys: ["status"]) else { return nil }
            return "\(title): \(status)"
        }
        return AgentsSnapshot(activeCount: active, errorCount: errors, lastRunLabels: labels)
    }

    func fetchWorkflowsSnapshot() async throws -> WorkflowsSnapshot {
        let payload = (try? await requestJSON(path: "/api/workflows?limit=10")) ?? []
        let items = APIParsers.extractPublicItems(from: payload)
        let active = items.filter {
            let s = ($0["status"] as? String)?.lowercased() ?? ""
            return s == "running" || s == "active"
        }.count
        let lastStatus = APIParsers.publicString(in: items.first ?? [:], keys: ["status", "state"]) ?? "—"
        return WorkflowsSnapshot(activeCount: active, lastRunStatus: lastStatus)
    }

    func fetchAdminSnapshot() async throws -> AdminSnapshot {
        let health = (try? await requestJSON(path: "/api/health/detailed")) ?? [:]
        let stats = (try? await requestJSON(path: "/api/admin/stats")) ?? [:]
        let healthDict = health as? [String: Any] ?? [:]
        let statsDict = stats as? [String: Any] ?? [:]
        let dbOk = (healthDict["dbStatus"] as? [String: Any])?["ok"] as? Bool
        let dbStatus = dbOk == true ? "Healthy" : (dbOk == false ? "Degraded" : "Unknown")
        let alerts = statsDict["sentinelAlerts"] as? Int ?? (statsDict["alerts"] as? Int) ?? 0
        let containers = APIParsers.publicString(in: statsDict, keys: ["containerHealth", "health"]) ?? "—"
        return AdminSnapshot(dbStatus: dbStatus, sentinelAlerts: alerts, containerHealth: containers)
    }
```

**Step 2: Add `extractPublicItems` and `publicString` helpers to APIParsers**

These are public versions of the existing private helpers, needed since the new methods call them from outside the `APIClient` extension. Add to `APIParsers` enum (after `focusItems`, before the private helpers):

```swift
    static func extractPublicItems(from payload: Any) -> [[String: Any]] {
        if let items = payload as? [[String: Any]] { return items }
        guard let dict = payload as? [String: Any] else { return [] }
        for key in ["items", "data", "deals", "runs", "results", "conversations", "workflows", "parcels"] {
            if let array = dict[key] as? [[String: Any]] { return array }
        }
        return [dict]
    }

    static func publicString(in dictionary: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = dictionary[key] as? String, value.isEmpty == false { return value }
            if let value = dictionary[key] as? NSNumber { return value.stringValue }
        }
        return nil
    }
```

**Step 3: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED. All APIClient methods compile.

**Step 4: Commit**

```bash
git add apps/macos/Sources/Services/APIClient.swift
git commit -m "feat(macos): add per-route fetch methods to APIClient"
```

---

### Task 3: Add per-route pane views

**File:** `apps/macos/Sources/Views/DetailViews.swift`

Add the following new pane structs at the end of the file, after `MemoryPane`. Keep all existing panes — `OverviewPane`, `DealsPane`, `RunsPane`, `MapPane`, `AutomationPane`, `MemoryPane` are still used.

```swift
// MARK: - Per-route panes (replacing OverviewPane / MemoryPane catch-alls)

struct ChatPane: View {
    let snapshot: ChatSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Chat", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "convos", label: "Conversations", value: "\(snapshot.conversationCount)", detail: "Total loaded"))
                    MetricCard(metric: OperatorMetric(id: "msgs", label: "Messages Today", value: "\(snapshot.messagesToday)", detail: "Updated this session"))
                }

                SurfaceCard(title: "Last Active Agent", subtitle: "Most recent conversation") {
                    Text(snapshot.lastActiveAgent)
                        .font(.headline)
                }
            }
            .padding(24)
        }
    }
}

struct CommandCenterPane: View {
    let snapshot: CommandCenterSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Command Center", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "collisions", label: "Memory Collisions", value: "\(snapshot.collisions)", detail: "Entity conflicts"))
                    MetricCard(metric: OperatorMetric(id: "queue", label: "Innovation Queue", value: "\(snapshot.innovationQueueDepth)", detail: "Pending items"))
                    MetricCard(metric: OperatorMetric(id: "drift", label: "Drift Alerts", value: "\(snapshot.driftAlerts)", detail: "Active alerts"))
                }

                SurfaceCard(title: "Briefing Date", subtitle: "Last daily briefing generated") {
                    Text(snapshot.briefingDate)
                        .font(.headline)
                }
            }
            .padding(24)
        }
    }
}

struct OpportunitiesPane: View {
    let snapshot: OpportunitiesSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Opportunities", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "screened", label: "Top Screened", value: "\(snapshot.screenedCount)", detail: "Returned from API"))
                    MetricCard(metric: OperatorMetric(id: "avg", label: "Avg Score", value: snapshot.avgScore, detail: "Top results"))
                }

                if snapshot.topParcelAddresses.isEmpty == false {
                    SurfaceCard(title: "Top Parcels", subtitle: "Highest scored") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.topParcelAddresses, id: \.self) { address in
                                Label(address, systemImage: "mappin")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct MarketPane: View {
    let snapshot: MarketSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Market Intel", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "alerts", label: "Alerts", value: "\(snapshot.alertCount)", detail: "Active market alerts"))
                    MetricCard(metric: OperatorMetric(id: "corridors", label: "Corridors", value: "\(snapshot.monitoredCorridors.count)", detail: "Monitored"))
                }

                SurfaceCard(title: "Briefing Date", subtitle: "Last daily briefing") {
                    Text(snapshot.briefingDate)
                        .font(.headline)
                }

                if snapshot.monitoredCorridors.isEmpty == false {
                    SurfaceCard(title: "Monitored Corridors", subtitle: "Active market coverage") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.monitoredCorridors, id: \.self) { corridor in
                                Label(corridor, systemImage: "chart.line.uptrend.xyaxis")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct PortfolioPane: View {
    let snapshot: PortfolioSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Portfolio", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "count", label: "Properties", value: "\(snapshot.propertyCount)", detail: "In portfolio"))
                    MetricCard(metric: OperatorMetric(id: "value", label: "Total Value", value: snapshot.totalValueLabel, detail: "Portfolio estimate"))
                    MetricCard(metric: OperatorMetric(id: "debt", label: "Debt Alerts", value: "\(snapshot.debtAlerts)", detail: "Maturing or at risk"))
                }
            }
            .padding(24)
        }
    }
}

struct WealthPane: View {
    let snapshot: WealthSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Wealth", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "networth", label: "Net Worth", value: snapshot.netWorthLabel, detail: "Snapshot"))
                    MetricCard(metric: OperatorMetric(id: "entities", label: "Entities", value: "\(snapshot.entityCount)", detail: "Active entities"))
                    MetricCard(metric: OperatorMetric(id: "tax", label: "Tax Alerts", value: "\(snapshot.taxAlerts)", detail: "Require attention"))
                }
            }
            .padding(24)
        }
    }
}

struct AgentsPane: View {
    let snapshot: AgentsSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Agents", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "active", label: "Active", value: "\(snapshot.activeCount)", detail: "Running now"))
                    MetricCard(metric: OperatorMetric(id: "errors", label: "Errors", value: "\(snapshot.errorCount)", detail: "Failed runs"))
                }

                if snapshot.lastRunLabels.isEmpty == false {
                    SurfaceCard(title: "Recent Runs", subtitle: "Last 3") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.lastRunLabels, id: \.self) { label in
                                Label(label, systemImage: "bolt.horizontal.circle")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct WorkflowsPane: View {
    let snapshot: WorkflowsSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Workflows", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "active", label: "Active", value: "\(snapshot.activeCount)", detail: "Running workflows"))
                    MetricCard(metric: OperatorMetric(id: "last", label: "Last Status", value: snapshot.lastRunStatus, detail: "Most recent run"))
                }
            }
            .padding(24)
        }
    }
}

struct AdminPane: View {
    let snapshot: AdminSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Admin", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "db", label: "Database", value: snapshot.dbStatus, detail: "Live health check"))
                    MetricCard(metric: OperatorMetric(id: "sentinel", label: "Sentinel Alerts", value: "\(snapshot.sentinelAlerts)", detail: "Active alerts"))
                    MetricCard(metric: OperatorMetric(id: "containers", label: "Containers", value: snapshot.containerHealth, detail: "Docker health"))
                }
            }
            .padding(24)
        }
    }
}
```

**Step 2: Make MetricCard and SurfaceCard internal (not private)**

In `DetailViews.swift`, change `private struct MetricCard` → `struct MetricCard` and `private struct SurfaceCard` → `struct SurfaceCard` so the new pane structs can reference them (they're in the same file so `private` should still work, but making them `internal` is cleaner).

**Step 3: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED, zero errors.

**Step 4: Commit**

```bash
git add apps/macos/Sources/Views/DetailViews.swift
git commit -m "feat(macos): add per-route inspector panes for all 14 active routes"
```

---

### Task 4: Final Agent 2 integration build

**Step 1: Full clean build**

```bash
cd apps/macos && swift build 2>&1
```

Expected: BUILD SUCCEEDED, zero errors, zero warnings introduced.

**Step 2: Verify launch**

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres && ./script/build_and_run.sh --verify
```

Expected: `Verification passed` (process found).

**Step 3: Commit if clean**

```bash
git add -A
git commit -m "feat(macos): Agent 2 complete — all per-route inspector panes wired and building"
```

---

## AGENT 3 — Native macOS Capabilities

**Files to create:**
- `apps/macos/Sources/Services/NotificationManager.swift`
- `apps/macos/Sources/Views/CommandPalette.swift`
- `apps/macos/Sources/Views/MenuBarController.swift`

**Files to modify:**
- `apps/macos/Sources/App/GallagherCresMacOSApp.swift`
- `apps/macos/Sources/Stores/AppStore.swift`
- `apps/macos/Sources/Views/ContentView.swift`

**Prerequisite:** Agent 2 must be complete (all types defined, `swift build` passing).

---

### Task 1: Dock badge

**File:** `apps/macos/Sources/Stores/AppStore.swift`

**Context:** The dock badge should show unread notifications + active run count. We derive this from existing `automationRecords` (unread events) and `runRecords` (active runs). No new API calls needed.

**Step 1: Add `updateDockBadge()` method to AppStore**

After `toggleInspector()`, add:

```swift
    func updateDockBadge() {
        let activeRuns = runRecords.filter {
            $0.status.lowercased() == "running" || $0.status.lowercased() == "active"
        }.count
        let count = activeRuns
        DispatchQueue.main.async {
            NSApp.dockTile.badgeLabel = count > 0 ? "\(count)" : nil
        }
    }
```

**Step 2: Call `updateDockBadge()` after refreshNativeData completes**

In `refreshNativeData()`, after `lastNativeRefreshLabel = Self.refreshLabelFormatter.string(from: .now)`, add:

```swift
            updateDockBadge()
```

**Step 3: Add AppKit import**

At the top of `AppStore.swift`, the file currently imports `Foundation` and `Observation`. Add:

```swift
import AppKit
```

**Step 4: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED.

**Step 5: Commit**

```bash
git add apps/macos/Sources/Stores/AppStore.swift
git commit -m "feat(macos): add dock badge showing active run count"
```

---

### Task 2: Native notifications

**File:** `apps/macos/Sources/Services/NotificationManager.swift` (create new)

```swift
import UserNotifications
import Foundation

@MainActor
final class NotificationManager {
    static let shared = NotificationManager()

    private init() {}

    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                print("[NotificationManager] Authorization error: \(error.localizedDescription)")
            }
        }
    }

    func fireRunCompleted(title: String, status: String) {
        let content = UNMutableNotificationContent()
        content.title = "Run Completed"
        content.body = "\(title): \(status)"
        content.sound = .default
        schedule(content: content, identifier: "run-\(title)-\(Date().timeIntervalSince1970)")
    }

    func fireDealUpdate(dealName: String, stage: String) {
        let content = UNMutableNotificationContent()
        content.title = "Deal Updated"
        content.body = "\(dealName) → \(stage)"
        content.sound = .default
        schedule(content: content, identifier: "deal-\(dealName)-\(Date().timeIntervalSince1970)")
    }

    func fireAutomationAlert(title: String, summary: String) {
        let content = UNMutableNotificationContent()
        content.title = "Automation Alert"
        content.body = "\(title): \(summary)"
        content.sound = .default
        schedule(content: content, identifier: "automation-\(title)-\(Date().timeIntervalSince1970)")
    }

    private func schedule(content: UNMutableNotificationContent, identifier: String) {
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: nil // deliver immediately
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                print("[NotificationManager] Failed to schedule: \(error.localizedDescription)")
            }
        }
    }
}
```

**Step 2: Wire notification request on app launch**

In `GallagherCresMacOSApp.swift`, in `applicationDidFinishLaunching`, add:

```swift
        NotificationManager.shared.requestAuthorization()
```

Also add `import UserNotifications` to `GallagherCresMacOSApp.swift`.

**Step 3: Fire notifications after data refresh in AppStore**

In `refreshNativeData()`, after `updateDockBadge()`, add:

```swift
            // Fire notifications for newly completed runs
            for run in runRecords where run.status.lowercased() == "completed" || run.status.lowercased() == "failed" {
                NotificationManager.shared.fireRunCompleted(title: run.title, status: run.status)
            }
```

**Note:** In a production iteration you'd track which runs have already been notified. For v1, this fires on each refresh — acceptable for initial implementation.

**Step 4: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED.

**Step 5: Commit**

```bash
git add apps/macos/Sources/Services/NotificationManager.swift apps/macos/Sources/App/GallagherCresMacOSApp.swift apps/macos/Sources/Stores/AppStore.swift
git commit -m "feat(macos): add UserNotifications support for run completions"
```

---

### Task 3: Menu bar status item

**File:** `apps/macos/Sources/Views/MenuBarController.swift` (create new)

```swift
import AppKit
import SwiftUI

@MainActor
final class MenuBarController: NSObject {
    private var statusItem: NSStatusItem?
    private var store: AppStore?
    private var popover: NSPopover?

    func setup(store: AppStore) {
        self.store = store
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "Entitlement OS")
            button.action = #selector(togglePopover)
            button.target = self
        }

        let pop = NSPopover()
        pop.contentSize = NSSize(width: 300, height: 280)
        pop.behavior = .transient
        pop.contentViewController = NSHostingController(
            rootView: MenuBarPopoverView(store: store)
        )
        popover = pop
    }

    func update(connectivity: ConnectivityState) {
        let symbolName: String
        switch connectivity {
        case .healthy: symbolName = "building.2"
        case .authRequired: symbolName = "building.2.crop.circle.badge.exclamationmark"
        case .degraded: symbolName = "building.2.crop.circle"
        case .failed: symbolName = "network.slash"
        default: symbolName = "building.2"
        }
        statusItem?.button?.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: "Entitlement OS")
    }

    @objc private func togglePopover() {
        guard let button = statusItem?.button, let popover else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }
}

private struct MenuBarPopoverView: View {
    @Bindable var store: AppStore

    private let quickRoutes: [DesktopRoute] = [.chat, .deals, .runs, .map, .commandCenter]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "building.2")
                    .foregroundStyle(.secondary)
                Text("Entitlement OS")
                    .font(.headline)
                Spacer()
                connectivityDot
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Quick Jump")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(quickRoutes) { route in
                    Button {
                        store.select(route: route)
                        NSApp.activate(ignoringOtherApps: true)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: route.systemImage)
                                .frame(width: 16)
                                .foregroundStyle(.secondary)
                            Text(route.title)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            Divider()

            Text(store.connectivity.siteSummary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(16)
    }

    private var connectivityDot: some View {
        Circle()
            .fill(dotColor)
            .frame(width: 8, height: 8)
    }

    private var dotColor: Color {
        switch store.connectivity.state {
        case .healthy: .green
        case .degraded: .yellow
        case .failed, .authRequired: .red
        default: .gray
        }
    }
}
```

**Step 2: Instantiate MenuBarController in the app**

In `GallagherCresMacOSApp.swift`:

1. Add property: `@ObservationIgnored private let menuBarController = MenuBarController()`
2. In `ContentView` `.task` modifier (or pass it through AppDelegate), wire it up. The cleanest approach is to add a `.onAppear` on `ContentView` or use a scene modifier. Since `AppStore` is already `@State`, pass `menuBarController` to AppStore for updates.

Simpler approach — add a `setupMenuBar(store:)` call from `ContentView.onAppear`:

In `GallagherCresMacOSApp.swift`, update `body`:

```swift
    var body: some Scene {
        WindowGroup("Gallagher Cres", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 1200, minHeight: 760)
                .onAppear {
                    menuBarController.setup(store: store)
                }
        }
        .commands {
            DesktopCommands(store: store)
        }

        Settings {
            SettingsView(store: store)
                .frame(width: 520, height: 340)
        }
    }
```

**Step 3: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED.

**Step 4: Commit**

```bash
git add apps/macos/Sources/Views/MenuBarController.swift apps/macos/Sources/App/GallagherCresMacOSApp.swift
git commit -m "feat(macos): add menu bar status item with connectivity indicator and quick-jump"
```

---

### Task 4: Cmd+K command palette

**File:** `apps/macos/Sources/Views/CommandPalette.swift` (create new)

```swift
import SwiftUI

struct CommandPaletteView: View {
    @Binding var isPresented: Bool
    let onSelect: (DesktopRoute) -> Void

    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var filteredRoutes: [DesktopRoute] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        guard q.isEmpty == false else { return DesktopRoute.allCases }
        return DesktopRoute.allCases.filter {
            $0.title.lowercased().contains(q) || $0.path.contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Jump to route...", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($searchFocused)
                    .onSubmit {
                        if let first = filteredRoutes.first {
                            onSelect(first)
                            isPresented = false
                        }
                    }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredRoutes) { route in
                        Button {
                            onSelect(route)
                            isPresented = false
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: route.systemImage)
                                    .frame(width: 18)
                                    .foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(route.title)
                                    Text(route.path)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .hoverEffect()
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .frame(width: 480)
        .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
        .onAppear { searchFocused = true }
    }
}
```

**Step 2: Add `showCommandPalette` state and overlay to ContentView**

In `ContentView.swift`:

1. Add to the `ContentView` struct body (after `@Bindable var store: AppStore`):
```swift
    @State private var showCommandPalette = false
```

2. Add `.overlay` on the outer `NavigationSplitView`:
```swift
        .overlay {
            if showCommandPalette {
                ZStack {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()
                        .onTapGesture { showCommandPalette = false }
                    CommandPaletteView(isPresented: $showCommandPalette) { route in
                        store.select(route: route)
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: showCommandPalette)
```

3. Add keyboard shortcut in `DesktopCommands`, in `CommandMenu("Entitlement OS")`, at the top:
```swift
            Button("Open Command Palette") {
                showCommandPalette = true
            }
            .keyboardShortcut("k", modifiers: .command)
```

Note: `showCommandPalette` is local state in `ContentView`, not in `AppStore`. The `DesktopCommands` struct needs access to it. Pass it as a `Binding`:

Update `DesktopCommands` to accept a binding:
```swift
struct DesktopCommands: Commands {
    @Bindable var store: AppStore
    @Binding var showCommandPalette: Bool
    ...
```

Update the instantiation in `GallagherCresMacOSApp.swift`:
```swift
        .commands {
            DesktopCommands(store: store, showCommandPalette: $store.showCommandPalette)
        }
```

Since `Commands` can't easily take a `@Binding` to a View's local state, the simplest solution is to move `showCommandPalette` into `AppStore`:

In `AppStore.swift`, add: `var showCommandPalette = false`

In `ContentView.swift`, reference `store.showCommandPalette` directly.

In `DesktopCommands`, add the button normally using `store.showCommandPalette = true`.

**Step 3: Build**

```bash
cd apps/macos && swift build
```

Expected: BUILD SUCCEEDED.

**Step 4: Commit**

```bash
git add apps/macos/Sources/Views/CommandPalette.swift apps/macos/Sources/Views/ContentView.swift apps/macos/Sources/Stores/AppStore.swift
git commit -m "feat(macos): add Cmd+K command palette for instant route navigation"
```

---

### Task 5: Window state persistence

**File:** `apps/macos/Sources/Stores/AppStore.swift`

**Context:** Remember the last selected route and window frame across launches. Route persistence is straightforward. Window frame persistence requires AppKit.

**Step 1: Persist selected route**

In `select(route:)`, after `selectedRoute = route`, add:
```swift
        defaults.set(route.rawValue, forKey: Keys.selectedRoute)
```

**Step 2: Restore selected route in init**

In `init()`, after `customPath = startPath`, add:
```swift
        if let savedRoute = defaults.string(forKey: Keys.selectedRoute),
           let route = DesktopRoute(rawValue: savedRoute) {
            selectedRoute = route
        }
```

**Step 3: Add Keys.selectedRoute**

```swift
        static let selectedRoute = "gallagher-cres.macos.selectedRoute"
```

**Step 4: Build + commit**

```bash
cd apps/macos && swift build
git add apps/macos/Sources/Stores/AppStore.swift
git commit -m "feat(macos): persist selected route across launches"
```

---

### Task 6: Final Agent 3 integration build and verification

**Step 1: Full clean build**

```bash
cd apps/macos && swift build 2>&1
```

Expected: BUILD SUCCEEDED, zero errors.

**Step 2: Verify launch**

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres && ./script/build_and_run.sh --verify
```

Expected: `Verification passed`.

**Step 3: Check logs for new noise**

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres && ./script/build_and_run.sh --logs
```

Expected: No new error patterns. Specifically check for no `Desktop data refresh failed` entries after navigating to each new route.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(macos): Agent 3 complete — dock badge, menu bar, notifications, Cmd+K palette, route persistence"
```

---

## Summary

| Agent | Scope | Key Files |
|-------|-------|-----------|
| Agent 1 | Routes, sidebar, AppStore wiring | DesktopModels.swift, SidebarView.swift, ContentView.swift, AppStore.swift |
| Agent 2 | Snapshot types, API fetchers, pane views | DesktopModels.swift, APIClient.swift, DetailViews.swift |
| Agent 3 | Dock badge, menu bar, notifications, Cmd+K, window state | NotificationManager.swift, MenuBarController.swift, CommandPalette.swift |

**Build command throughout:** `cd apps/macos && swift build`

**Sequence:** Agent 1 → Agent 2 → Agent 3. Each agent's output must build cleanly before the next starts.
