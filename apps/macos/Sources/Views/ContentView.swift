import SwiftUI

struct ContentView: View {
    @Bindable var store: AppStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationSplitView {
            SidebarView(store: store)
        } detail: {
            detailView
                .navigationTitle(store.selectedRoute.title)
                .toolbar {
                    ToolbarItemGroup {
                        Button {
                            Task { await store.refreshCurrentRoute() }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .keyboardShortcut("r", modifiers: [.command])

                        Button {
                            openURL(routeURL)
                        } label: {
                            Label("Open Web App", systemImage: "safari")
                        }
                    }
                }
        }
        .overlay(alignment: .bottomLeading) {
            if store.lastErrorMessage.isEmpty == false {
                ErrorBanner(message: store.lastErrorMessage)
                    .padding()
            }
        }
        .task {
            await store.refreshAll()
        }
    }

    @ViewBuilder
    private var detailView: some View {
        switch store.selectedRoute {
        case .overview:
            OverviewPane(snapshot: store.snapshot, lastRefreshLabel: store.lastRefreshLabel)
        case .deals:
            DealsPane(records: store.deals, lastRefreshLabel: store.lastRefreshLabel)
        case .runs:
            RunsPane(records: store.runs, lastRefreshLabel: store.lastRefreshLabel)
        case .map:
            MapPane(record: store.mapRecord, lastRefreshLabel: store.lastRefreshLabel)
        case .automation:
            AutomationPane(records: store.automationRecords, lastRefreshLabel: store.lastRefreshLabel)
        case .memory:
            MemoryPane(snapshot: store.snapshot, lastRefreshLabel: store.lastRefreshLabel)
        }
    }

    private var routeURL: URL {
        let path: String = switch store.selectedRoute {
        case .overview: "/command-center"
        case .deals: "/deals"
        case .runs: "/runs"
        case .map: "/map"
        case .automation: "/automation"
        case .memory: "/command-center/memory"
        }

        return URL(string: store.endpointConfiguration.baseURL + path)
            ?? URL(string: "http://localhost:3000")!
    }
}

struct DesktopCommands: Commands {
    @Bindable var store: AppStore

    var body: some Commands {
        CommandMenu("Entitlement OS") {
            Button("Refresh Current Surface") {
                Task { await store.refreshCurrentRoute() }
            }
            .keyboardShortcut("r", modifiers: [.command])

            Button("Refresh Everything") {
                Task { await store.refreshAll() }
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])
        }

        CommandMenu("Navigate") {
            ForEach(DesktopRoute.allCases) { route in
                Button(route.title) {
                    store.select(route: route)
                }
            }
        }
    }
}

private struct ErrorBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)

            Text(message)
                .font(.callout)
                .lineLimit(3)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
