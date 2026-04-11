import Foundation
import Observation

@MainActor
@Observable
final class AppStore {
    var selectedRoute: DesktopRoute = .commandCenter
    var endpointConfiguration: EndpointConfiguration
    var currentURLString = ""
    var currentPageTitle = "Entitlement OS"
    var customPath = ""
    var canGoBack = false
    var canGoForward = false
    var isLoadingPage = false
    var lastErrorMessage = ""
    var connectivity = ConnectivitySnapshot.initial
    var operatorSnapshot = OperatorSnapshot.placeholder
    var dealRecords: [DealRecord] = []
    var runRecords: [RunRecord] = []
    var mapRecord = MapRecord.placeholder
    var automationRecords: [AutomationRecord] = []
    var lastNativeRefreshLabel = "Never"
    var isRefreshingNativeData = false

    @ObservationIgnored let browserController = BrowserController()
    @ObservationIgnored private let defaults = UserDefaults.standard

    init() {
        let storedBaseURL = defaults.string(forKey: Keys.baseURL)
        let baseURL = Self.migrateBaseURLIfNeeded(storedBaseURL)
        let startPath = defaults.string(forKey: Keys.startPath) ?? EndpointConfiguration.default.startPath
        let bearerToken = defaults.string(forKey: Keys.bearerToken) ?? EndpointConfiguration.default.bearerToken
        endpointConfiguration = EndpointConfiguration(baseURL: baseURL, startPath: startPath, bearerToken: bearerToken)
        customPath = startPath
        defaults.set(baseURL, forKey: Keys.baseURL)
    }

    func saveConfiguration(baseURL: String, startPath: String, bearerToken: String) {
        endpointConfiguration = EndpointConfiguration(
            baseURL: sanitizeBaseURL(baseURL),
            startPath: normalizedPath(startPath),
            bearerToken: bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        customPath = endpointConfiguration.startPath
        defaults.set(endpointConfiguration.baseURL, forKey: Keys.baseURL)
        defaults.set(endpointConfiguration.startPath, forKey: Keys.startPath)
        defaults.set(endpointConfiguration.bearerToken, forKey: Keys.bearerToken)
        DesktopLogger.settings.info("Saved web configuration for \(self.endpointConfiguration.baseURL, privacy: .public)")
        open(path: endpointConfiguration.startPath)
        Task { await runConnectivityCheck() }
    }

    func select(route: DesktopRoute) {
        selectedRoute = route
        customPath = route.path
        DesktopLogger.navigation.info("Selected route \(route.rawValue, privacy: .public)")
        open(path: route.path)
        Task { await refreshNativeData() }
    }

    func loadInitialRouteIfNeeded() {
        guard currentURLString.isEmpty else { return }
        open(path: endpointConfiguration.startPath)
        Task { await runConnectivityCheck() }
    }

    func reloadCurrentPage() {
        DesktopLogger.refresh.info("Reloading current page")
        browserController.reload()
    }

    func goBack() {
        DesktopLogger.navigation.info("Navigating back")
        browserController.goBack()
    }

    func goForward() {
        DesktopLogger.navigation.info("Navigating forward")
        browserController.goForward()
    }

    func openCustomPath() {
        open(path: customPath)
    }

    func openLogin() {
        customPath = "/login"
        DesktopLogger.navigation.info("Opening login route from desktop shell")
        open(path: "/login")
    }

    func absoluteURLForCurrentRoute() -> URL {
        url(for: currentURLString.isEmpty ? selectedRoute.path : currentURLString) ?? fallbackURL
    }

    func updateBrowserState(_ state: BrowserNavigationState) {
        let previousURL = currentURLString
        currentURLString = state.urlString
        currentPageTitle = state.title
        canGoBack = state.canGoBack
        canGoForward = state.canGoForward
        isLoadingPage = state.isLoading
        lastErrorMessage = ""

        if let path = URL(string: state.urlString)?.path, path.isEmpty == false {
            customPath = path
        }

        if state.isLoading == false, state.urlString.isEmpty == false, state.urlString != previousURL {
            Task { await runConnectivityCheck() }
        }
    }

    func registerNavigationError(_ message: String) {
        lastErrorMessage = message
        DesktopLogger.refresh.error("Navigation error: \(message, privacy: .public)")
    }

    func runConnectivityCheck() async {
        connectivity.state = .checking
        let snapshot = await ConnectivityProbe(
            configuration: endpointConfiguration,
            browserController: browserController
        ).run()
        connectivity = snapshot

        if snapshot.state == .healthy {
            DesktopLogger.refresh.info("Connectivity probe healthy at \(snapshot.checkedAtLabel, privacy: .public)")
        } else if snapshot.state == .authRequired {
            DesktopLogger.refresh.info(
                "Connectivity probe auth-required: \(snapshot.apiSummary, privacy: .public) / \(snapshot.databaseSummary, privacy: .public)"
            )
        } else {
            DesktopLogger.refresh.error(
                "Connectivity probe \(snapshot.state.rawValue, privacy: .public): \(snapshot.apiSummary, privacy: .public) / \(snapshot.databaseSummary, privacy: .public)"
            )
        }

        await refreshNativeData()
    }

    func refreshNativeData() async {
        guard isRefreshingNativeData == false else { return }
        isRefreshingNativeData = true
        defer { isRefreshingNativeData = false }

        if connectivity.state == .authRequired {
            applySignedOutDesktopState()
            lastNativeRefreshLabel = Self.refreshLabelFormatter.string(from: .now)
            return
        }

        do {
            let client = APIClient(
                configuration: endpointConfiguration,
                browserController: browserController
            )

            switch selectedRoute {
            case .deals:
                dealRecords = try await client.fetchDeals()
            case .runs:
                runRecords = try await client.fetchRuns()
            case .map:
                mapRecord = try await client.fetchMapRecord()
            case .automation:
                automationRecords = try await client.fetchAutomationRecords()
            case .agents, .portfolio, .evidence, .reference, .admin:
                operatorSnapshot = await client.fetchDashboardSnapshot()
            case .commandCenter, .chat, .opportunities, .workflows, .market, .buyers, .screening:
                operatorSnapshot = await client.fetchDashboardSnapshot()
            }

            lastNativeRefreshLabel = Self.refreshLabelFormatter.string(from: .now)
            if lastErrorMessage.hasPrefix("Desktop data refresh failed") {
                lastErrorMessage = ""
            }
        } catch {
            lastErrorMessage = "Desktop data refresh failed: \(error.localizedDescription)"
            DesktopLogger.refresh.error("Desktop data refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    var allowedHost: String? {
        URL(string: endpointConfiguration.baseURL)?.host
    }

    var initialURL: URL {
        url(for: endpointConfiguration.startPath) ?? fallbackURL
    }

    private func open(path: String) {
        guard let targetURL = url(for: path) else {
            registerNavigationError("Invalid path \(path)")
            return
        }

        browserController.navigate(to: targetURL)
    }

    private func url(for pathOrURL: String) -> URL? {
        let trimmed = pathOrURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return nil }

        if let absoluteURL = URL(string: trimmed), absoluteURL.scheme != nil {
            return absoluteURL
        }

        let normalized = normalizedPath(trimmed)
        return URL(string: endpointConfiguration.baseURL + normalized)
    }

    private func sanitizeBaseURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return normalized.isEmpty ? EndpointConfiguration.default.baseURL : normalized
    }

    private static func migrateBaseURLIfNeeded(_ storedValue: String?) -> String {
        guard let storedValue else { return EndpointConfiguration.default.baseURL }

        let normalized = sanitizeStaticBaseURL(storedValue)
        if normalized == "http://localhost:3000" {
            DesktopLogger.settings.info("Migrating stored localhost base URL to production default")
            return EndpointConfiguration.default.baseURL
        }

        return normalized
    }

    private static func sanitizeStaticBaseURL(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
        return normalized.isEmpty ? EndpointConfiguration.default.baseURL : normalized
    }

    private func normalizedPath(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return EndpointConfiguration.default.startPath }
        return trimmed.hasPrefix("/") ? trimmed : "/\(trimmed)"
    }

    private func applySignedOutDesktopState() {
        operatorSnapshot = OperatorSnapshot(
            statusLine: "Desktop sign-in required",
            metrics: [
                OperatorMetric(id: "health", label: "Platform", value: "Sign in", detail: "Protected operator APIs are gated behind the website session."),
                OperatorMetric(id: "deals", label: "Deals", value: "--", detail: "Unlock after signing in."),
                OperatorMetric(id: "runs", label: "Runs", value: "--", detail: "Unlock after signing in.")
            ],
            focusItems: [
                "Open /login in the web pane to establish a production session.",
                "Use Settings only if you need to override the base URL or supply an advanced bearer token."
            ]
        )
        dealRecords = []
        runRecords = []
        automationRecords = []
        mapRecord = MapRecord.placeholder
    }

    private var fallbackURL: URL {
        URL(string: EndpointConfiguration.default.baseURL + EndpointConfiguration.default.startPath)!
    }
}

private extension AppStore {
    static let refreshLabelFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    enum Keys {
        static let baseURL = "gallagher-cres.macos.baseURL"
        static let startPath = "gallagher-cres.macos.startPath"
        static let bearerToken = "gallagher-cres.macos.bearerToken"
    }
}
