import Foundation

enum DesktopRoute: String, CaseIterable, Identifiable {
    case overview
    case deals
    case runs
    case map
    case automation
    case memory

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: "Overview"
        case .deals: "Deals"
        case .runs: "Runs"
        case .map: "Map"
        case .automation: "Automation"
        case .memory: "Memory"
        }
    }

    var subtitle: String {
        switch self {
        case .overview: "Operator command surface"
        case .deals: "Pipeline, diligence, and approvals"
        case .runs: "Agent runs and verification"
        case .map: "Parcel workspaces and overlays"
        case .automation: "Cron health and escalation"
        case .memory: "Learning systems and retrieval"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: "square.grid.2x2"
        case .deals: "building.2"
        case .runs: "bolt.horizontal.circle"
        case .map: "map"
        case .automation: "clock.arrow.circlepath"
        case .memory: "brain"
        }
    }
}

struct EndpointConfiguration: Equatable {
    var baseURL: String
    var bearerToken: String

    static let `default` = EndpointConfiguration(
        baseURL: "http://localhost:3000",
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
