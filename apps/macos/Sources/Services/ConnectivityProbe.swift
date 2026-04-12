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
        let authResult = await fetch(path: "/api/agent/auth/resolve", authorize: true, sessionContext: sessionContext)
        let operatorResult = await fetch(path: "/api/runs/dashboard", authorize: true, sessionContext: sessionContext)
        let healthResult = await fetch(path: "/api/health", authorize: true, sessionContext: sessionContext)
        let detailedResult = await fetch(path: "/api/health/detailed", authorize: true, sessionContext: sessionContext)

        let state = deriveState(
            siteResult: siteResult,
            authResult: authResult,
            operatorResult: operatorResult,
            healthResult: healthResult,
            detailedResult: detailedResult,
            sessionContext: sessionContext
        )

        return ConnectivitySnapshot(
            state: state,
            siteSummary: summarizeSite(siteResult),
            apiSummary: summarizeOperatorAPI(
                authResult: authResult,
                operatorResult: operatorResult,
                sessionContext: sessionContext
            ),
            databaseSummary: summarizeSystemHealth(
                healthResult: healthResult,
                detailedResult: detailedResult,
                authResult: authResult,
                operatorResult: operatorResult,
                sessionContext: sessionContext
            ),
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
        authResult: ProbeResult,
        operatorResult: ProbeResult,
        healthResult: ProbeResult,
        detailedResult: ProbeResult,
        sessionContext: SessionContext
    ) -> ConnectivityState {
        if siteResult.isFailure {
            return .failed
        }

        let operatorAPIsHealthy = authResult.isSuccess && operatorResult.isSuccess

        if operatorAPIsHealthy {
            if detailedResult.isSuccess, detailedResult.databaseOK == false {
                return .degraded
            }

            if healthResult.isFailure, healthResult.isUnauthorized == false {
                return .degraded
            }

            if detailedResult.isFailure, detailedResult.isUnauthorized == false {
                return .degraded
            }

            return .healthy
        }

        if authResult.isUnauthorized || operatorResult.isUnauthorized {
            if configuration.bearerToken.isEmpty,
               authResult.usedPageSession || operatorResult.usedPageSession {
                return .authRequired
            }

            return sessionContext.hasUsableAuthentication || configuration.bearerToken.isEmpty == false
                ? .authRequired
                : .authRequired
        }

        if authResult.isFailure || operatorResult.isFailure {
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

    private func summarizeOperatorAPI(
        authResult: ProbeResult,
        operatorResult: ProbeResult,
        sessionContext: SessionContext?
    ) -> String {
        if authResult.isSuccess, operatorResult.isSuccess {
            return "Operator APIs are healthy. Authenticated production routes are responding."
        }

        if authResult.isUnauthorized || operatorResult.isUnauthorized {
            if configuration.bearerToken.isEmpty == false {
                return "Configured bearer token does not authorize operator APIs."
            }

            if authResult.usedPageSession || operatorResult.usedPageSession {
                return "Desktop page session is not authenticated for protected operator APIs yet."
            }

            if sessionContext?.hasUsableAuthentication == true {
                return "Desktop auth token was present, but operator APIs still returned 401."
            }

            return "Sign in in the desktop app or provide an advanced bearer token to unlock native operator data."
        }

        if let statusCode = operatorResult.statusCode {
            return "Operator APIs responded with HTTP \(statusCode)."
        }

        return "Operator API probe failed: \(operatorResult.errorMessage ?? authResult.errorMessage ?? "Unknown error")."
    }

    private func summarizeSystemHealth(
        healthResult: ProbeResult,
        detailedResult: ProbeResult,
        authResult: ProbeResult,
        operatorResult: ProbeResult,
        sessionContext: SessionContext?
    ) -> String {
        if healthResult.isUnauthorized || detailedResult.isUnauthorized {
            if authResult.isSuccess, operatorResult.isSuccess {
                return "Elevated health endpoints require a dedicated health token, but operator APIs are healthy."
            }

            if configuration.bearerToken.isEmpty == false {
                return "Configured bearer token does not unlock elevated health endpoints."
            }

            if sessionContext?.hasUsableAuthentication == true {
                return "Operator auth is present, but elevated health endpoints still require a dedicated health token."
            }

            return "Detailed system health unlocks after desktop sign-in or a dedicated health token."
        }

        if let payload = detailedResult.payload,
           let dbStatus = payload["dbStatus"] as? [String: Any] {
            let ok = (dbStatus["ok"] as? Bool) ?? false
            let detail = (dbStatus["detail"] as? String) ?? ((dbStatus["reason"] as? String) ?? "No DB detail")
            return ok ? "Database healthy: \(detail)" : "Database unhealthy: \(detail)"
        }

        if let statusCode = detailedResult.statusCode {
            return "Detailed health responded with HTTP \(statusCode)."
        }

        if let statusCode = healthResult.statusCode {
            return "System health responded with HTTP \(statusCode)."
        }

        return "Detailed health failed: \(detailedResult.errorMessage ?? healthResult.errorMessage ?? "Unknown error")."
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
