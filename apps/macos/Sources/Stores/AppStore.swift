import Foundation
import Observation

@MainActor
@Observable
final class AppStore {
    var selectedRoute: DesktopRoute = .overview
    var endpointConfiguration: EndpointConfiguration
    var snapshot: OperatorSnapshot = .placeholder
    var deals: [DealRecord] = []
    var runs: [RunRecord] = []
    var mapRecord: MapRecord = .placeholder
    var automationRecords: [AutomationRecord] = []
    var isRefreshing = false
    var lastErrorMessage = ""
    var lastRefreshLabel = "Never"

    @ObservationIgnored private let defaults = UserDefaults.standard

    init() {
        let baseURL = defaults.string(forKey: Keys.baseURL) ?? EndpointConfiguration.default.baseURL
        let bearerToken = defaults.string(forKey: Keys.bearerToken) ?? EndpointConfiguration.default.bearerToken
        endpointConfiguration = EndpointConfiguration(baseURL: baseURL, bearerToken: bearerToken)
    }

    func saveConfiguration(baseURL: String, bearerToken: String) {
        endpointConfiguration = EndpointConfiguration(
            baseURL: baseURL.trimmingCharacters(in: .whitespacesAndNewlines),
            bearerToken: bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        defaults.set(endpointConfiguration.baseURL, forKey: Keys.baseURL)
        defaults.set(endpointConfiguration.bearerToken, forKey: Keys.bearerToken)
        DesktopLogger.settings.info("Saved endpoint configuration for \(self.endpointConfiguration.baseURL, privacy: .public)")
    }

    func select(route: DesktopRoute) {
        selectedRoute = route
        DesktopLogger.navigation.info("Selected route \(route.rawValue, privacy: .public)")
    }

    func refreshCurrentRoute() async {
        guard isRefreshing == false else { return }
        isRefreshing = true
        lastErrorMessage = ""
        DesktopLogger.refresh.info("Refreshing route \(self.selectedRoute.rawValue, privacy: .public)")
        defer { isRefreshing = false }

        do {
            switch selectedRoute {
            case .overview:
                snapshot = try await client.fetchDashboardSnapshot()
            case .deals:
                deals = try await client.fetchDeals()
            case .runs:
                runs = try await client.fetchRuns()
            case .map:
                mapRecord = try await client.fetchMapRecord()
            case .automation:
                automationRecords = try await client.fetchAutomationRecords()
            case .memory:
                snapshot = try await client.fetchDashboardSnapshot()
            }

            lastRefreshLabel = Self.timestampFormatter.string(from: .now)
        } catch {
            lastErrorMessage = error.localizedDescription
            DesktopLogger.refresh.error("Refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func refreshAll() async {
        guard isRefreshing == false else { return }
        isRefreshing = true
        lastErrorMessage = ""
        DesktopLogger.refresh.info("Refreshing all desktop surfaces")
        defer { isRefreshing = false }

        do {
            async let overview = client.fetchDashboardSnapshot()
            async let fetchedDeals = client.fetchDeals()
            async let fetchedRuns = client.fetchRuns()
            async let fetchedMap = client.fetchMapRecord()
            async let fetchedAutomation = client.fetchAutomationRecords()

            snapshot = try await overview
            deals = try await fetchedDeals
            runs = try await fetchedRuns
            mapRecord = try await fetchedMap
            automationRecords = try await fetchedAutomation
            lastRefreshLabel = Self.timestampFormatter.string(from: .now)
        } catch {
            lastErrorMessage = error.localizedDescription
            DesktopLogger.refresh.error("Global refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private var client: APIClient {
        APIClient(configuration: endpointConfiguration)
    }
}

private extension AppStore {
    enum Keys {
        static let baseURL = "gallagher-cres.macos.baseURL"
        static let bearerToken = "gallagher-cres.macos.bearerToken"
    }

    static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}
