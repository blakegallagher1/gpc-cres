import SwiftUI

struct ContentView: View {
    @Bindable var store: AppStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationSplitView {
            SidebarView(store: store)
        } detail: {
            VStack(spacing: 0) {
                DesktopWebView(
                    controller: store.browserController,
                    allowedHost: store.allowedHost,
                    initialURL: store.initialURL
                ) { state in
                    store.updateBrowserState(state)
                }
                .overlay(alignment: .topTrailing) {
                    if store.isLoadingPage {
                        ProgressView()
                            .controlSize(.small)
                            .padding(10)
                    }
                }

                Divider()

                HStack(spacing: 12) {
                    Label(store.currentPageTitle, systemImage: "macwindow")
                        .lineLimit(1)

                    Spacer()

                    Text(store.currentURLString.isEmpty ? store.initialURL.absoluteString : store.currentURLString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.thinMaterial)
            }
            .navigationTitle(store.selectedRoute.title)
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
                    .keyboardShortcut("r", modifiers: [.command])

                    TextField("Path", text: $store.customPath)
                        .textFieldStyle(.roundedBorder)
                        .frame(minWidth: 240)
                        .onSubmit {
                            store.openCustomPath()
                        }

                    Button {
                        store.openCustomPath()
                    } label: {
                        Label("Go", systemImage: "arrow.right.circle")
                    }

                    Button {
                        openURL(store.absoluteURLForCurrentRoute())
                    } label: {
                        Label("Open in Browser", systemImage: "safari")
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
