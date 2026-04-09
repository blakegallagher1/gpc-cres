import SwiftUI

struct SettingsView: View {
    @Bindable var store: AppStore
    @State private var baseURL = ""
    @State private var bearerToken = ""

    var body: some View {
        Form {
            Section("Endpoint") {
                TextField("Base URL", text: $baseURL)
                    .textFieldStyle(.roundedBorder)

                SecureField("Bearer token (optional)", text: $bearerToken)
                    .textFieldStyle(.roundedBorder)
            }

            Section("Desktop Behavior") {
                Label("Refresh surfaces from the toolbar or Command menu.", systemImage: "arrow.clockwise")
                Label("Open the matching browser surface when the native pane needs deeper workflow coverage.", systemImage: "safari")
                Label("Logs are written with unified logging categories for navigation, API, refresh, and settings.", systemImage: "waveform.path.ecg")
            }

            HStack {
                Spacer()

                Button("Save Configuration") {
                    store.saveConfiguration(baseURL: baseURL, bearerToken: bearerToken)
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .onAppear {
            baseURL = store.endpointConfiguration.baseURL
            bearerToken = store.endpointConfiguration.bearerToken
        }
    }
}
