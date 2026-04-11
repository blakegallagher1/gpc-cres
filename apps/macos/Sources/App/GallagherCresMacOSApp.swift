import AppKit
import SwiftUI
import UserNotifications

@main
struct GallagherCresMacOSApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store = AppStore()
    @ObservationIgnored private let menuBarController = MenuBarController()

    var body: some Scene {
        WindowGroup("Gallagher Cres", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 1200, minHeight: 760)
                .onAppear {
                    menuBarController.setup(store: store)
                }
                .onChange(of: store.connectivity.state) { _, _ in
                    menuBarController.update(connectivity: store.connectivity)
                }
        }
        .commands {
            DesktopCommands(store: store)
        }

        Settings {
            SettingsView(store: store)
                .frame(width: 520, height: 340)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        NotificationManager.shared.requestAuthorization()
        DesktopLogger.windowing.info("Application finished launching")
    }
}
