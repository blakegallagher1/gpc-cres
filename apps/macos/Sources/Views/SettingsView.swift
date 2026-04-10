import SwiftUI

struct SettingsView: View {
    @Bindable var store: AppStore
    @State private var baseURL = ""
    @State private var startPath = ""
    @State private var bearerToken = ""

    var body: some View {
        Form {
            Section("Website Environment") {
                TextField("Base URL", text: $baseURL)
                    .textFieldStyle(.roundedBorder)

                TextField("Start Path", text: $startPath)
                    .textFieldStyle(.roundedBorder)

                SecureField("Advanced bearer token (optional)", text: $bearerToken)
                    .textFieldStyle(.roundedBorder)
            }

            Section("Behavior") {
                Label("The desktop app now hosts the full Entitlement OS website in a native macOS shell.", systemImage: "macwindow")
                Label("Sign in through the website session to unlock the same production features you use in the browser.", systemImage: "person.badge.key")
                Label("Sidebar favorites jump to major production surfaces, and the path field can open any route.", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                Label("Unified logging remains enabled for navigation, refresh, settings, and window lifecycle events.", systemImage: "waveform.path.ecg")
            }

            HStack {
                Spacer()

                Button("Save Configuration") {
                    store.saveConfiguration(baseURL: baseURL, startPath: startPath, bearerToken: bearerToken)
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .onAppear {
            baseURL = store.endpointConfiguration.baseURL
            startPath = store.endpointConfiguration.startPath
            bearerToken = store.endpointConfiguration.bearerToken
        }
    }
}
