import Foundation

enum DesktopRoute: String, CaseIterable, Identifiable {
    case commandCenter
    case chat
    case deals
    case map
    case opportunities
    case workflows
    case runs
    case notifications
    case agents
    case automation
    case market
    case portfolio
    case wealth
    case settings
    case evidence
    case buyers
    case screening
    case reference
    case admin

    var id: String { rawValue }

    var title: String {
        switch self {
        case .commandCenter: "Command Center"
        case .chat: "Chat"
        case .deals: "Deals"
        case .map: "Map"
        case .opportunities: "Opportunities"
        case .workflows: "Workflows"
        case .runs: "Runs"
        case .notifications: "Notifications"
        case .agents: "Agents"
        case .automation: "Automation"
        case .market: "Market"
        case .portfolio: "Portfolio"
        case .wealth: "Wealth"
        case .settings: "Settings"
        case .evidence: "Evidence"
        case .buyers: "Buyers"
        case .screening: "Screening"
        case .reference: "Reference"
        case .admin: "Admin"
        }
    }

    var subtitle: String {
        switch self {
        case .commandCenter: "Operator control surface"
        case .chat: "Full production chat client"
        case .deals: "Pipeline, diligence, and approvals"
        case .map: "Parcel workspaces and overlays"
        case .opportunities: "Opportunity OS inbox and thesis"
        case .workflows: "Workflow execution and review"
        case .runs: "Agent runs and verification"
        case .notifications: "Unread updates and approval prompts"
        case .agents: "Agent catalog and diagnostics"
        case .automation: "Cron health and escalation"
        case .market: "Permits, overlays, and intelligence"
        case .portfolio: "Portfolio analytics and stress"
        case .wealth: "Net worth, entities, and tax"
        case .settings: "User preferences and configuration"
        case .evidence: "Evidence packages and delivery"
        case .buyers: "Buyer pipeline and outreach"
        case .screening: "Screening intake and playbooks"
        case .reference: "Reference data and operators"
        case .admin: "Admin, codex, and observability"
        }
    }

    var systemImage: String {
        switch self {
        case .commandCenter: "square.grid.2x2"
        case .chat: "bubble.left.and.bubble.right"
        case .deals: "building.2"
        case .map: "map"
        case .opportunities: "sparkles.rectangle.stack"
        case .workflows: "point.3.connected.trianglepath.dotted"
        case .runs: "bolt.horizontal.circle"
        case .notifications: "bell.badge"
        case .agents: "person.3.sequence"
        case .automation: "clock.arrow.circlepath"
        case .market: "chart.line.uptrend.xyaxis"
        case .portfolio: "briefcase"
        case .wealth: "chart.pie"
        case .settings: "gear"
        case .evidence: "doc.text.image"
        case .buyers: "person.2"
        case .screening: "checklist"
        case .reference: "books.vertical"
        case .admin: "shield.lefthalf.filled"
        }
    }

    var path: String {
        switch self {
        case .commandCenter: "/command-center"
        case .chat: "/chat"
        case .deals: "/deals"
        case .map: "/map"
        case .opportunities: "/opportunities"
        case .workflows: "/automation?tab=builder"
        case .runs: "/runs"
        case .notifications: "/chat"
        case .agents: "/agents"
        case .automation: "/automation"
        case .market: "/market"
        case .portfolio: "/portfolio"
        case .wealth: "/wealth"
        case .settings: "/settings"
        case .evidence: "/evidence"
        case .buyers: "/buyers"
        case .screening: "/screening"
        case .reference: "/reference"
        case .admin: "/admin"
        }
    }
}

struct EndpointConfiguration: Equatable {
    var baseURL: String
    var startPath: String
    var bearerToken: String

    static let `default` = EndpointConfiguration(
        baseURL: "https://gallagherpropco.com",
        startPath: DesktopRoute.commandCenter.path,
        bearerToken: ""
    )
}

enum ConnectivityState: String {
    case unknown
    case checking
    case authRequired
    case healthy
    case degraded
    case failed
}

struct ConnectivitySnapshot: Equatable {
    var state: ConnectivityState
    var siteSummary: String
    var apiSummary: String
    var databaseSummary: String
    var checkedAtLabel: String

    static let initial = ConnectivitySnapshot(
        state: .unknown,
        siteSummary: "No connectivity probe has run yet.",
        apiSummary: "API health not checked.",
        databaseSummary: "Database status unavailable.",
        checkedAtLabel: "Never"
    )
}

struct OperatorMetric: Identifiable, Hashable {
    let id: String
    let label: String
    let value: String
    let detail: String
}

struct OperatorSnapshot: Equatable {
    var statusLine: String
    var metrics: [OperatorMetric]
    var focusItems: [String]

    static let placeholder = OperatorSnapshot(
        statusLine: "Waiting for first refresh",
        metrics: [
            OperatorMetric(id: "health", label: "Platform", value: "Unknown", detail: "No ping yet"),
            OperatorMetric(id: "deals", label: "Deals", value: "0", detail: "No payload"),
            OperatorMetric(id: "runs", label: "Runs", value: "0", detail: "No payload")
        ],
        focusItems: [
            "Refresh after entering a reachable Entitlement OS base URL.",
            "Provide a bearer token if the selected environment requires auth."
        ]
    )
}

struct DealRecord: Identifiable, Hashable {
    let id: String
    let name: String
    let stage: String
    let location: String
    let score: String
    let updatedAt: String
}

struct RunRecord: Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let startedAt: String
    let summary: String
}

struct MapRecord: Hashable {
    let activeWorkspaceLabel: String
    let selectedParcelsLabel: String
    let outlookItems: [String]

    static let placeholder = MapRecord(
        activeWorkspaceLabel: "No active workspace",
        selectedParcelsLabel: "0 selected parcels",
        outlookItems: [
            "Use this pane to watch parcel workspace counts and last-known prospecting context.",
            "Open the web operator console from the toolbar when you need the full map canvas."
        ]
    )
}

struct AutomationRecord: Hashable {
    let title: String
    let summary: String
}

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

struct NotificationsSnapshot: Equatable {
    var unreadCount: Int
    var latestTitles: [String]

    static let placeholder = NotificationsSnapshot(
        unreadCount: 0,
        latestTitles: []
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
