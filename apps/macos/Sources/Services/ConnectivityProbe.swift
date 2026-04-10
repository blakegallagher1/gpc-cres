import Foundation

struct ConnectivityProbe {
    let configuration: EndpointConfiguration
    private let session: URLSession

    init(configuration: EndpointConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    func run() async -> ConnectivitySnapshot {
        let siteResult = await fetch(path: "/", authorize: false)
        let apiResult = await fetch(path: "/api/health", authorize: true)
        let detailedResult = await fetch(path: "/api/health/detailed", authorize: true)

        let state = deriveState(siteResult: siteResult, apiResult: apiResult, detailedResult: detailedResult)

        return ConnectivitySnapshot(
            state: state,
            siteSummary: summarizeSite(siteResult),
            apiSummary: summarizeAPI(apiResult),
            databaseSummary: summarizeDatabase(detailedResult),
            checkedAtLabel: Self.timestampFormatter.string(from: .now)
        )
    }

    private func fetch(path: String, authorize: Bool) async -> ProbeResult {
        guard let url = URL(string: configuration.baseURL + path) else {
            return ProbeResult(path: path, statusCode: nil, payload: nil, errorMessage: "Invalid URL")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15

        if authorize, configuration.bearerToken.isEmpty == false {
            request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await session.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            return ProbeResult(path: path, statusCode: statusCode, payload: payload, errorMessage: nil)
        } catch {
            return ProbeResult(path: path, statusCode: nil, payload: nil, errorMessage: error.localizedDescription)
        }
    }

    private func deriveState(siteResult: ProbeResult, apiResult: ProbeResult, detailedResult: ProbeResult) -> ConnectivityState {
        if siteResult.isFailure {
            return .failed
        }

        if apiResult.isSuccess, detailedResult.isSuccess, detailedResult.databaseOK {
            return .healthy
        }

        if apiResult.isUnauthorized || detailedResult.isUnauthorized {
            return .degraded
        }

        if apiResult.isFailure || detailedResult.isFailure || detailedResult.databaseOK == false {
            return .degraded
        }

        return .unknown
    }

    private func summarizeSite(_ result: ProbeResult) -> String {
        if let statusCode = result.statusCode {
            return "Site responded with HTTP \(statusCode)."
        }

        return "Site check failed: \(result.errorMessage ?? "Unknown error")."
    }

    private func summarizeAPI(_ result: ProbeResult) -> String {
        if result.isUnauthorized {
            return "API health requires a bearer token or signed-in session."
        }

        if let statusCode = result.statusCode {
            return "API health responded with HTTP \(statusCode)."
        }

        return "API health failed: \(result.errorMessage ?? "Unknown error")."
    }

    private func summarizeDatabase(_ result: ProbeResult) -> String {
        if result.isUnauthorized {
            return "Detailed DB health requires a bearer token."
        }

        if let payload = result.payload,
           let dbStatus = payload["dbStatus"] as? [String: Any] {
            let ok = (dbStatus["ok"] as? Bool) ?? false
            let detail = (dbStatus["detail"] as? String) ?? ((dbStatus["reason"] as? String) ?? "No DB detail")
            return ok ? "Database healthy: \(detail)" : "Database unhealthy: \(detail)"
        }

        if let statusCode = result.statusCode {
            return "Detailed health responded with HTTP \(statusCode)."
        }

        return "Detailed health failed: \(result.errorMessage ?? "Unknown error")."
    }
}

private struct ProbeResult {
    let path: String
    let statusCode: Int?
    let payload: [String: Any]?
    let errorMessage: String?

    var isSuccess: Bool {
        guard let statusCode else { return false }
        return (200 ... 299).contains(statusCode)
    }

    var isUnauthorized: Bool {
        statusCode == 401
    }

    var isFailure: Bool {
        guard let statusCode else { return true }
        return !(200 ... 299).contains(statusCode)
    }

    var databaseOK: Bool {
        guard let payload, let dbStatus = payload["dbStatus"] as? [String: Any] else { return false }
        return (dbStatus["ok"] as? Bool) ?? false
    }
}

private extension ConnectivityProbe {
    static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}
