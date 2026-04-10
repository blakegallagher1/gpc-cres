import Foundation

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
        case .agents: "Agents"
        case .automation: "Automation"
        case .market: "Market"
        case .portfolio: "Portfolio"
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
        case .agents: "Agent catalog and diagnostics"
        case .automation: "Cron health and escalation"
        case .market: "Permits, overlays, and intelligence"
        case .portfolio: "Portfolio analytics and stress"
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
        case .agents: "person.3.sequence"
        case .automation: "clock.arrow.circlepath"
        case .market: "chart.line.uptrend.xyaxis"
        case .portfolio: "briefcase"
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
        case .workflows: "/workflows"
        case .runs: "/runs"
        case .agents: "/agents"
        case .automation: "/automation"
        case .market: "/market"
        case .portfolio: "/portfolio"
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
        baseURL: "http://localhost:3000",
        startPath: DesktopRoute.commandCenter.path,
        bearerToken: ""
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
