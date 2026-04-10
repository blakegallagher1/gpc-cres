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
