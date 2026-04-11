import UserNotifications
import Foundation

@MainActor
final class NotificationManager {
    static let shared = NotificationManager()
    private init() {}

    func requestAuthorization() {
        Task {
            do {
                try await UNUserNotificationCenter.current()
                    .requestAuthorization(options: [.alert, .sound, .badge])
            } catch {
                print("[NotificationManager] Authorization error: \(error.localizedDescription)")
            }
        }
    }

    func fireRunCompleted(title: String, status: String) {
        let content = UNMutableNotificationContent()
        content.title = "Run Completed"
        content.body = "\(title): \(status)"
        content.sound = .default
        schedule(content: content, identifier: "run-\(title)-\(Date().timeIntervalSince1970)")
    }

    func fireDealUpdate(dealName: String, stage: String) {
        let content = UNMutableNotificationContent()
        content.title = "Deal Updated"
        content.body = "\(dealName) → \(stage)"
        content.sound = .default
        schedule(content: content, identifier: "deal-\(dealName)-\(Date().timeIntervalSince1970)")
    }

    func fireAutomationAlert(title: String, summary: String) {
        let content = UNMutableNotificationContent()
        content.title = "Automation Alert"
        content.body = "\(title): \(summary)"
        content.sound = .default
        schedule(content: content, identifier: "automation-\(title)-\(Date().timeIntervalSince1970)")
    }

    private func schedule(content: UNMutableNotificationContent, identifier: String) {
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                print("[NotificationManager] Failed to schedule: \(error.localizedDescription)")
            }
        }
    }
}
