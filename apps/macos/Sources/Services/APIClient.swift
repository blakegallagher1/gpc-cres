import Foundation
import WebKit

struct APIClient {
    let configuration: EndpointConfiguration
    let browserController: BrowserController?
    private let session: URLSession

    init(
        configuration: EndpointConfiguration,
        browserController: BrowserController? = nil,
        session: URLSession = .shared
    ) {
        self.configuration = configuration
        self.browserController = browserController
        self.session = session
    }

    func fetchDashboardSnapshot() async -> OperatorSnapshot {
        let health = try? await requestJSON(path: "/api/health/detailed")
        let deals = try? await requestJSON(path: "/api/deals")
        let runs = try? await requestJSON(path: "/api/runs/dashboard")

        let healthPayload = health ?? ["message": "Detailed health is unavailable in the current session."]
        let dealsPayload = deals ?? []
        let runsPayload = runs ?? []

        let statusLine = APIParsers.healthSummary(from: healthPayload)
        let metrics = [
            OperatorMetric(
                id: "health",
                label: "Platform",
                value: APIParsers.healthStatus(from: healthPayload),
                detail: statusLine
            ),
            OperatorMetric(
                id: "deals",
                label: "Deals",
                value: "\(APIParsers.dealRecords(from: dealsPayload).count)",
                detail: "Loaded from /api/deals"
            ),
            OperatorMetric(
                id: "runs",
                label: "Runs",
                value: APIParsers.runRecords(from: runsPayload).first?.status ?? "Unknown",
                detail: "\(APIParsers.runRecords(from: runsPayload).count) records returned"
            )
        ]

        return OperatorSnapshot(
            statusLine: statusLine,
            metrics: metrics,
            focusItems: APIParsers.focusItems(
                health: healthPayload,
                deals: dealsPayload,
                runs: runsPayload
            )
        )
    }

    func fetchDeals() async throws -> [DealRecord] {
        try APIParsers.dealRecords(from: await requestJSON(path: "/api/deals"))
    }

    func fetchRuns() async throws -> [RunRecord] {
        try APIParsers.runRecords(from: await requestJSON(path: "/api/runs"))
    }

    func fetchMapRecord() async throws -> MapRecord {
        let activeWorkspacePayload = try await requestJSON(path: "/api/map/workspaces/active")
        let workspacePayload = try await requestJSON(path: "/api/map/workspaces")
        return APIParsers.mapRecord(activeWorkspace: activeWorkspacePayload, allWorkspaces: workspacePayload)
    }

    func fetchAutomationRecords() async throws -> [AutomationRecord] {
        let payload = try await requestJSON(path: "/api/automation/events")
        return APIParsers.automationRecords(from: payload)
    }

    func requestJSON(path: String) async throws -> Any {
        if let browserController,
           let pageResult = await browserController.fetchJSONUsingPageSession(path: path) {
            if let statusCode = pageResult.statusCode, (200 ... 299).contains(statusCode), let payload = pageResult.payload {
                return payload
            }
        }

        guard let url = URL(string: configuration.baseURL + path) else {
            throw DesktopAPIError.invalidBaseURL(configuration.baseURL)
        }

        let sessionContext = await resolveSessionContext()
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let cookieHeader = sessionContext.cookieHeader {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }

        if configuration.bearerToken.isEmpty == false {
            request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
        } else if let authToken = sessionContext.authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }

        DesktopLogger.api.info("Requesting \(path, privacy: .public)")
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw DesktopAPIError.invalidResponse
        }

        guard (200 ... 299).contains(httpResponse.statusCode) else {
            throw DesktopAPIError.httpStatus(httpResponse.statusCode)
        }

        return try JSONSerialization.jsonObject(with: data)
    }
}

enum DesktopAPIError: LocalizedError {
    case invalidBaseURL(String)
    case invalidResponse
    case httpStatus(Int)

    var errorDescription: String? {
        switch self {
        case let .invalidBaseURL(baseURL):
            "Invalid base URL: \(baseURL)"
        case .invalidResponse:
            "The server returned a non-HTTP response."
        case let .httpStatus(statusCode):
            "The server returned HTTP \(statusCode)."
        }
    }
}

private struct SessionContext {
    let cookieHeader: String?
    let authToken: String?
}

private extension APIClient {
    func resolveSessionContext() async -> SessionContext {
        let cookies = await loadCookies()
        let cookieHeader = cookies.isEmpty ? nil : HTTPCookie.requestHeaderFields(with: cookies)["Cookie"]

        if configuration.bearerToken.isEmpty == false {
            return SessionContext(cookieHeader: cookieHeader, authToken: nil)
        }

        return SessionContext(
            cookieHeader: cookieHeader,
            authToken: await fetchAuthToken(cookieHeader: cookieHeader)
        )
    }

    @MainActor
    func loadCookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }

    func fetchAuthToken(cookieHeader: String?) async -> String? {
        guard let url = URL(string: configuration.baseURL + "/api/auth/token") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15

        if let cookieHeader {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return nil
            }

            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return payload?["token"] as? String
        } catch {
            return nil
        }
    }
}

enum APIParsers {
    static func healthStatus(from payload: Any) -> String {
        if let dictionary = payload as? [String: Any] {
            if let status = dictionary["status"] as? String {
                return status.capitalized
            }

            if let overall = nestedDictionary(in: dictionary, keys: ["system", "status"]),
               let status = overall["value"] as? String {
                return status.capitalized
            }
        }

        return "Unknown"
    }

    static func healthSummary(from payload: Any) -> String {
        guard let dictionary = payload as? [String: Any] else {
            return "Health payload was not a dictionary."
        }

        if let checks = firstArray(in: dictionary, keys: ["checks", "components"]),
           checks.isEmpty == false {
            return "Health checks returned \(checks.count) components."
        }

        if let message = dictionary["message"] as? String {
            return message
        }

        return "Connected to /api/health/detailed."
    }

    static func dealRecords(from payload: Any) -> [DealRecord] {
        let items = extractItems(from: payload)

        return items.enumerated().map { index, item in
            DealRecord(
                id: string(in: item, keys: ["id", "dealId"]) ?? "deal-\(index)",
                name: string(in: item, keys: ["name", "title", "dealName"]) ?? "Untitled deal",
                stage: string(in: item, keys: ["stage", "status", "pipelineStage"]) ?? "Unknown stage",
                location: [
                    string(in: item, keys: ["city"]),
                    string(in: item, keys: ["state"])
                ]
                .compactMap { $0 }
                .joined(separator: ", ")
                .ifEmpty("Unknown location"),
                score: string(in: item, keys: ["score", "triageScore", "priority"]) ?? "n/a",
                updatedAt: string(in: item, keys: ["updatedAt", "lastUpdatedAt", "createdAt"]) ?? "Unknown"
            )
        }
    }

    static func runRecords(from payload: Any) -> [RunRecord] {
        let items = extractItems(from: payload)

        return items.enumerated().map { index, item in
            RunRecord(
                id: string(in: item, keys: ["id", "runId"]) ?? "run-\(index)",
                title: string(in: item, keys: ["title", "agent", "workflow", "name"]) ?? "Agent run",
                status: string(in: item, keys: ["status", "state"]) ?? "Unknown",
                startedAt: string(in: item, keys: ["startedAt", "createdAt", "updatedAt"]) ?? "Unknown",
                summary: string(in: item, keys: ["summary", "outcome", "latestEvent"]) ?? "No summary available"
            )
        }
    }

    static func mapRecord(activeWorkspace: Any, allWorkspaces: Any) -> MapRecord {
        let activeLabel: String
        if let activeDictionary = activeWorkspace as? [String: Any],
           let title = string(in: activeDictionary, keys: ["name", "title", "workspaceName"]) {
            activeLabel = title
        } else {
            activeLabel = "No active workspace"
        }

        let workspaceItems = extractItems(from: allWorkspaces)
        let selectedCount = workspaceItems
            .compactMap { dictionary -> Int? in
                if let value = dictionary["selectedParcelCount"] as? Int { return value }
                if let parcels = dictionary["parcelIds"] as? [Any] { return parcels.count }
                return nil
            }
            .reduce(0, +)

        let items = workspaceItems.prefix(3).compactMap { dictionary in
            string(in: dictionary, keys: ["name", "title", "workspaceName"])
        }

        return MapRecord(
            activeWorkspaceLabel: activeLabel,
            selectedParcelsLabel: "\(selectedCount) selected parcels across \(workspaceItems.count) workspaces",
            outlookItems: items.isEmpty ? MapRecord.placeholder.outlookItems : items
        )
    }

    static func automationRecords(from payload: Any) -> [AutomationRecord] {
        let items = extractItems(from: payload)
        let records = items.prefix(5).map { item in
            AutomationRecord(
                title: string(in: item, keys: ["title", "name", "kind"]) ?? "Automation event",
                summary: string(in: item, keys: ["summary", "status", "eventType"]) ?? "No summary available"
            )
        }

        return records.isEmpty
            ? [AutomationRecord(title: "No events returned", summary: "Check API auth and automation volume.")]
            : records
    }

    static func focusItems(health: Any, deals: Any, runs: Any) -> [String] {
        let dealCount = dealRecords(from: deals).count
        let runCount = runRecords(from: runs).count
        let status = healthStatus(from: health)

        return [
            "Platform status: \(status).",
            "Desktop client loaded \(dealCount) deals from the Entitlement OS API.",
            "Desktop client loaded \(runCount) runs from the run surfaces."
        ]
    }

    private static func extractItems(from payload: Any) -> [[String: Any]] {
        if let items = payload as? [[String: Any]] {
            return items
        }

        guard let dictionary = payload as? [String: Any] else {
            return []
        }

        if let items = firstArray(in: dictionary, keys: ["items", "data", "deals", "runs", "results"]) {
            return items
        }

        return [dictionary]
    }

    private static func firstArray(in dictionary: [String: Any], keys: [String]) -> [[String: Any]]? {
        for key in keys {
            if let array = dictionary[key] as? [[String: Any]] {
                return array
            }
        }

        return nil
    }

    private static func nestedDictionary(in dictionary: [String: Any], keys: [String]) -> [String: Any]? {
        guard let first = keys.first else { return nil }
        guard let value = dictionary[first] as? [String: Any] else { return nil }
        let remainingKeys = Array(keys.dropFirst())
        return remainingKeys.isEmpty ? value : nestedDictionary(in: value, keys: remainingKeys)
    }

    private static func string(in dictionary: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = dictionary[key] as? String, value.isEmpty == false {
                return value
            }

            if let value = dictionary[key] as? NSNumber {
                return value.stringValue
            }
        }

        return nil
    }
}

private extension String {
    func ifEmpty(_ replacement: String) -> String {
        isEmpty ? replacement : self
    }
}
