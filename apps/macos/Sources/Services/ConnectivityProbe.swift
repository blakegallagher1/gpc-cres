import Foundation
import WebKit

struct ConnectivityProbe {
    let configuration: EndpointConfiguration
    let browserController: BrowserController?
    private let session: URLSession

    init(configuration: EndpointConfiguration, browserController: BrowserController? = nil, session: URLSession = .shared) {
        self.configuration = configuration
        self.browserController = browserController
        self.session = session
    }

    func run() async -> ConnectivitySnapshot {
        let sessionContext = await resolveSessionContext()
        let siteResult = await fetch(path: "/", authorize: false)
        let apiResult = await fetch(path: "/api/health", authorize: true, sessionContext: sessionContext)
        let detailedResult = await fetch(path: "/api/health/detailed", authorize: true, sessionContext: sessionContext)

        let state = deriveState(
            siteResult: siteResult,
            apiResult: apiResult,
            detailedResult: detailedResult,
            sessionContext: sessionContext
        )

        return ConnectivitySnapshot(
            state: state,
            siteSummary: summarizeSite(siteResult),
            apiSummary: summarizeAPI(apiResult, sessionContext: sessionContext),
            databaseSummary: summarizeDatabase(detailedResult),
            checkedAtLabel: Self.timestampFormatter.string(from: .now)
        )
    }

    private func fetch(path: String, authorize: Bool, sessionContext: SessionContext? = nil) async -> ProbeResult {
        if authorize,
           let browserController,
           let pageResult = await browserController.fetchJSONUsingPageSession(path: path) {
            if let statusCode = pageResult.statusCode, (200 ... 299).contains(statusCode) {
                return ProbeResult(
                    path: path,
                    statusCode: statusCode,
                    payload: pageResult.payload,
                    errorMessage: pageResult.errorMessage,
                    usedPageSession: true
                )
            }

            if pageResult.statusCode == 401 {
                return ProbeResult(
                    path: path,
                    statusCode: 401,
                    payload: pageResult.payload,
                    errorMessage: pageResult.errorMessage,
                    usedPageSession: true
                )
            }
        }

        guard let url = URL(string: configuration.baseURL + path) else {
            return ProbeResult(path: path, statusCode: nil, payload: nil, errorMessage: "Invalid URL", usedPageSession: false)
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
            return ProbeResult(path: path, statusCode: statusCode, payload: payload, errorMessage: nil, usedPageSession: false)
        } catch {
            return ProbeResult(path: path, statusCode: nil, payload: nil, errorMessage: error.localizedDescription, usedPageSession: false)
        }
    }

    private func deriveState(
        siteResult: ProbeResult,
        apiResult: ProbeResult,
        detailedResult: ProbeResult,
        sessionContext: SessionContext
    ) -> ConnectivityState {
        if siteResult.isFailure {
            return .failed
        }

        if apiResult.isSuccess, detailedResult.isSuccess, detailedResult.databaseOK {
            return .healthy
        }

        if apiResult.isUnauthorized || detailedResult.isUnauthorized {
            if configuration.bearerToken.isEmpty,
               apiResult.usedPageSession || detailedResult.usedPageSession {
                return .authRequired
            }

            return sessionContext.hasUsableAuthentication || configuration.bearerToken.isEmpty == false
                ? .degraded
                : .authRequired
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

            if result.usedPageSession {
                return "Desktop page session still returned 401 for /api/health."
            }

            if sessionContext?.hasUsableAuthentication == true {
                return "Desktop auth token was present, but API health still returned 401."
            }

            return "Sign in in the desktop app or provide a bearer token in Settings to unlock protected health endpoints."
        }

        if let statusCode = result.statusCode {
            return "API health responded with HTTP \(statusCode)."
        }

        return "API health failed: \(result.errorMessage ?? "Unknown error")."
    }

    private func summarizeDatabase(_ result: ProbeResult) -> String {
        if result.isUnauthorized {
            return configuration.bearerToken.isEmpty
                ? "Detailed DB health unlocks after desktop sign-in or a bearer token."
                : "Detailed DB health rejected the configured bearer token."
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
    let usedPageSession: Bool

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

    var hasUsableAuthentication: Bool {
        authToken?.isEmpty == false
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
