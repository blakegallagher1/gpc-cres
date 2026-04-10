import SwiftUI

struct ContentView: View {
    @Bindable var store: AppStore

    var body: some View {
        DesktopWebView(
            controller: store.browserController,
            allowedHost: store.allowedHost,
            initialURL: store.initialURL
        ) { state in
            store.updateBrowserState(state)
        } onNavigationError: { message in
            store.registerNavigationError(message)
        }
        .background(WindowConfigurator())
        .overlay {
            if store.currentURLString.isEmpty, store.isLoadingPage == false {
                LoadFailureView(
                    baseURL: store.endpointConfiguration.baseURL,
                    errorMessage: store.lastErrorMessage
                )
            }
        }
        .ignoresSafeArea()
        .overlay(alignment: .bottomLeading) {
            if store.lastErrorMessage.isEmpty == false {
                ErrorBanner(message: store.lastErrorMessage)
                    .padding()
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if store.connectivity.state == .checking || store.connectivity.state == .degraded || store.connectivity.state == .failed {
                ConnectivityBadge(snapshot: store.connectivity)
                    .padding()
            }
        }
        .overlay(alignment: .topTrailing) {
            if store.isLoadingPage {
                ProgressView()
                    .controlSize(.small)
                    .padding(10)
            }
        }
        .task {
            store.loadInitialRouteIfNeeded()
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
