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

    func absoluteURLForCurrentRoute() -> URL {
        url(for: currentURLString.isEmpty ? selectedRoute.path : currentURLString) ?? fallbackURL
    }

    func updateBrowserState(_ state: BrowserNavigationState) {
        currentURLString = state.urlString
        currentPageTitle = state.title
        canGoBack = state.canGoBack
        canGoForward = state.canGoForward
        isLoadingPage = state.isLoading
        lastErrorMessage = ""

        if let path = URL(string: state.urlString)?.path, path.isEmpty == false {
            customPath = path
        }
    }

    func registerNavigationError(_ message: String) {
        lastErrorMessage = message
        DesktopLogger.refresh.error("Navigation error: \(message, privacy: .public)")
    }

    func runConnectivityCheck() async {
        connectivity.state = .checking
        let snapshot = await ConnectivityProbe(configuration: endpointConfiguration).run()
        connectivity = snapshot

        if snapshot.state == .healthy {
            DesktopLogger.refresh.info("Connectivity probe healthy at \(snapshot.checkedAtLabel, privacy: .public)")
        } else {
            DesktopLogger.refresh.error(
                "Connectivity probe \(snapshot.state.rawValue, privacy: .public): \(snapshot.apiSummary, privacy: .public) / \(snapshot.databaseSummary, privacy: .public)"
            )
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

    private var fallbackURL: URL {
        URL(string: EndpointConfiguration.default.baseURL + EndpointConfiguration.default.startPath)!
    }
}

private extension AppStore {
    enum Keys {
        static let baseURL = "gallagher-cres.macos.baseURL"
        static let startPath = "gallagher-cres.macos.startPath"
        static let bearerToken = "gallagher-cres.macos.bearerToken"
    }
}
