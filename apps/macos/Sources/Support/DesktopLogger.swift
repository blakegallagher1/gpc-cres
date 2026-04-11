import Foundation
import OSLog

enum DesktopLogger {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.gallagherpropco.entitlement-os.macos"

    static let windowing = Logger(subsystem: subsystem, category: "Windowing")
    static let navigation = Logger(subsystem: subsystem, category: "Navigation")
    static let api = Logger(subsystem: subsystem, category: "API")
    static let refresh = Logger(subsystem: subsystem, category: "Refresh")
    static let settings = Logger(subsystem: subsystem, category: "Settings")
}
