import AppKit
import SwiftUI

@main
struct GallagherCresMacOSApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup("Gallagher Cres", id: "main") {
            ContentView(store: store)
                .frame(minWidth: 1200, minHeight: 760)
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
        DesktopLogger.windowing.info("Application finished launching")
    }
}
