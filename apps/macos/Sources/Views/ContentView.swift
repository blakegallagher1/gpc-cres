import SwiftUI

struct ContentView: View {
    @Bindable var store: AppStore

    var body: some View {
        NavigationSplitView {
            SidebarView(store: store)
                .navigationSplitViewColumnWidth(min: 240, ideal: 280)
        } detail: {
            HSplitView {
                webWorkspace
                    .frame(minWidth: 760, maxWidth: .infinity, maxHeight: .infinity)

                NativeInspectorPane(store: store)
                    .frame(minWidth: 320, idealWidth: 360, maxWidth: 440, maxHeight: .infinity)
            }
            .background(WindowConfigurator())
        }
        .toolbar {
            ToolbarItemGroup {
                Button {
                    store.goBack()
                } label: {
                    Label("Back", systemImage: "chevron.backward")
                }
                .disabled(store.canGoBack == false)

                Button {
                    store.goForward()
                } label: {
                    Label("Forward", systemImage: "chevron.forward")
                }
                .disabled(store.canGoForward == false)

                Button {
                    store.reloadCurrentPage()
                } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                }
            }

            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(store.selectedRoute.title)
                        .font(.headline)
                    Text(store.currentPageTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: 320)
            }

            ToolbarItemGroup {
                TextField("Path", text: $store.customPath)
                    .textFieldStyle(.roundedBorder)
                    .frame(minWidth: 220)
                    .onSubmit {
                        store.openCustomPath()
                    }

                Button("Open") {
                    store.openCustomPath()
                }

                Button {
                    Task { await store.refreshNativeData() }
                } label: {
                    Label("Refresh Desktop Data", systemImage: "arrow.clockwise.circle")
                }
                .disabled(store.isRefreshingNativeData)
            }
        }
        .task {
            store.loadInitialRouteIfNeeded()
            await store.refreshNativeData()
        }
    }

    private var webWorkspace: some View {
        DesktopWebView(
            controller: store.browserController,
            allowedHost: store.allowedHost,
            initialURL: store.initialURL
        ) { state in
            store.updateBrowserState(state)
        } onNavigationError: { message in
            store.registerNavigationError(message)
        }
        .overlay {
            if store.currentURLString.isEmpty, store.isLoadingPage == false {
                LoadFailureView(
                    baseURL: store.endpointConfiguration.baseURL,
                    errorMessage: store.lastErrorMessage
                )
            }
        }
        .overlay(alignment: .bottomLeading) {
            if store.lastErrorMessage.isEmpty == false {
                ErrorBanner(message: store.lastErrorMessage)
                    .padding()
            }
        }
        .overlay(alignment: .bottomTrailing) {
            VStack(alignment: .trailing, spacing: 12) {
                if store.connectivity.state == .checking
                    || store.connectivity.state == .authRequired
                    || store.connectivity.state == .degraded
                    || store.connectivity.state == .failed {
                    ConnectivityBadge(snapshot: store.connectivity)
                }

                if store.isLoadingPage {
                    ProgressView()
                        .controlSize(.small)
                        .padding(10)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding()
        }
    }
}

struct DesktopCommands: Commands {
    @Bindable var store: AppStore

    var body: some Commands {
        CommandMenu("Entitlement OS") {
            Button("Reload Current Page") {
                store.reloadCurrentPage()
            }
            .keyboardShortcut("r", modifiers: [.command])

            Button("Go Back") {
                store.goBack()
            }
            .keyboardShortcut("[", modifiers: [.command])
            .disabled(store.canGoBack == false)

            Button("Go Forward") {
                store.goForward()
            }
            .keyboardShortcut("]", modifiers: [.command])
            .disabled(store.canGoForward == false)

            Button("Open Start Path") {
                store.openCustomPath()
            }
            .keyboardShortcut("l", modifiers: [.command, .shift])

            Button("Check Live Connectivity") {
                Task { await store.runConnectivityCheck() }
            }

            Button("Refresh Desktop Data") {
                Task { await store.refreshNativeData() }
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

private struct NativeInspectorPane: View {
    @Bindable var store: AppStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            inspectorHeader
            Divider()
            inspectorBody
        }
        .background(.thinMaterial)
    }

    private var inspectorHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Desktop Inspector")
                        .font(.headline)

                    Text(store.selectedRoute.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if store.isRefreshingNativeData {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            Text("Last refresh \(store.lastNativeRefreshLabel)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
    }

    @ViewBuilder
    private var inspectorBody: some View {
        switch store.selectedRoute {
        case .deals:
            if store.dealRecords.isEmpty, store.isRefreshingNativeData == false {
                EmptyInspectorState(message: "No deal records have been loaded yet.")
            } else {
                DealsPane(records: store.dealRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
            }
        case .runs:
            if store.runRecords.isEmpty, store.isRefreshingNativeData == false {
                EmptyInspectorState(message: "No run records have been loaded yet.")
            } else {
                RunsPane(records: store.runRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
            }
        case .map:
            MapPane(record: store.mapRecord, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .automation:
            AutomationPane(records: store.automationRecords, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .agents, .portfolio, .evidence, .reference, .admin:
            MemoryPane(snapshot: store.operatorSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        case .commandCenter, .chat, .opportunities, .workflows, .market, .buyers, .screening:
            OverviewPane(snapshot: store.operatorSnapshot, lastRefreshLabel: store.lastNativeRefreshLabel)
        }
    }
}

private struct EmptyInspectorState: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.title2)
                .foregroundStyle(.secondary)

            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

private struct ConnectivityBadge: View {
    let snapshot: ConnectivitySnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
            Text(snapshot.apiSummary)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text(snapshot.databaseSummary)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(12)
        .frame(width: 260, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var title: String {
        switch snapshot.state {
        case .checking: "Checking live connectivity..."
        case .authRequired: "Authentication required"
        case .healthy: "Live stack healthy"
        case .degraded: "Live stack degraded"
        case .failed: "Live stack unreachable"
        case .unknown: "Connectivity unknown"
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

private struct LoadFailureView: View {
    let baseURL: String
    let errorMessage: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "network.slash")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.secondary)

            Text("Unable to load Entitlement OS")
                .font(.title3.weight(.semibold))

            Text(errorMessage.isEmpty ? "The app has not received a page response yet." : errorMessage)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Text(baseURL)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
        .padding(28)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
