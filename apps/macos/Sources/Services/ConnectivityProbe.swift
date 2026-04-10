import Foundation
import WebKit

struct ConnectivityProbe {
    let configuration: EndpointConfiguration
    private let session: URLSession

    init(configuration: EndpointConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
    }

    func run() async -> ConnectivitySnapshot {
        let sessionContext = await resolveSessionContext()
        let siteResult = await fetch(path: "/", authorize: false)
        let apiResult = await fetch(path: "/api/health", authorize: true, sessionContext: sessionContext)
        let detailedResult = await fetch(path: "/api/health/detailed", authorize: true, sessionContext: sessionContext)

        let state = deriveState(siteResult: siteResult, apiResult: apiResult, detailedResult: detailedResult)

        return ConnectivitySnapshot(
            state: state,
            siteSummary: summarizeSite(siteResult),
            apiSummary: summarizeAPI(apiResult, sessionContext: sessionContext),
            databaseSummary: summarizeDatabase(detailedResult),
            checkedAtLabel: Self.timestampFormatter.string(from: .now)
        )
    }

    private func fetch(path: String, authorize: Bool, sessionContext: SessionContext? = nil) async -> ProbeResult {
        guard let url = URL(string: configuration.baseURL + path) else {
            return ProbeResult(path: path, statusCode: nil, payload: nil, errorMessage: "Invalid URL")
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15

        if let cookieHeader = sessionContext?.cookieHeader {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }

        if authorize {
            if configuration.bearerToken.isEmpty == false {
                request.setValue("Bearer \(configuration.bearerToken)", forHTTPHeaderField: "Authorization")
            } else if let authToken = sessionContext?.authToken {
                request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            }
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

    private func summarizeAPI(_ result: ProbeResult, sessionContext: SessionContext?) -> String {
        if result.isUnauthorized {
            if configuration.bearerToken.isEmpty == false {
                return "API health rejected the configured bearer token."
            }

            if sessionContext?.hasCookies == true {
                return "Signed-in session present, but /api/auth/token or health auth still returned 401."
            }

            return "API health requires sign-in in the desktop app or a bearer token in Settings."
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

    private func resolveSessionContext() async -> SessionContext {
        let cookies = await loadCookies()
        let cookieHeader = cookies.isEmpty ? nil : HTTPCookie.requestHeaderFields(with: cookies)["Cookie"]

        if configuration.bearerToken.isEmpty == false {
            return SessionContext(cookieHeader: cookieHeader, authToken: nil, hasCookies: cookies.isEmpty == false)
        }

        let authToken = await fetchAuthToken(cookieHeader: cookieHeader)
        return SessionContext(
            cookieHeader: cookieHeader,
            authToken: authToken,
            hasCookies: cookies.isEmpty == false
        )
    }

    @MainActor
    private func loadCookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }

    private func fetchAuthToken(cookieHeader: String?) async -> String? {
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

private struct SessionContext {
    let cookieHeader: String?
    let authToken: String?
    let hasCookies: Bool
}

private extension ConnectivityProbe {
    static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}
