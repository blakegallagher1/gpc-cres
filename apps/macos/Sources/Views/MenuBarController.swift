import AppKit
import SwiftUI

// MARK: - Menu Bar Popover Content

struct MenuBarPopoverView: View {
    let store: AppStore
    let onSelect: (DesktopRoute) -> Void

    private let quickRoutes: [DesktopRoute] = [.chat, .deals, .runs, .map, .commandCenter]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            routeList
            Divider()
            footer
        }
        .frame(width: 300)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(connectivityColor)
                .frame(width: 8, height: 8)
            Text("Entitlement OS")
                .font(.headline)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var routeList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(quickRoutes) { route in
                MenuBarRouteRow(route: route) {
                    onSelect(route)
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var footer: some View {
        Text(store.connectivity.siteSummary)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
    }

    private var connectivityColor: Color {
        switch store.connectivity.state {
        case .healthy: .green
        case .authRequired: .orange
        case .degraded: .yellow
        case .failed: .red
        case .checking: .blue
        case .unknown: .gray
        }
    }
}

private struct MenuBarRouteRow: View {
    let route: DesktopRoute
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: route.systemImage)
                    .frame(width: 16)
                    .foregroundStyle(.secondary)
                Text(route.title)
                    .font(.callout)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(isHovered ? Color.primary.opacity(0.07) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

// MARK: - Menu Bar Controller

@MainActor
final class MenuBarController: NSObject {
    private var statusItem: NSStatusItem?
    private var popover: NSPopover?
    private weak var store: AppStore?

    func setup(store: AppStore) {
        self.store = store

        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        self.statusItem = statusItem

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "Entitlement OS")
            button.action = #selector(togglePopover)
            button.target = self
        }

        let popover = NSPopover()
        popover.contentSize = NSSize(width: 300, height: 280)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: MenuBarPopoverView(store: store) { [weak store] route in
                Task { @MainActor in
                    store?.select(route: route)
                }
            }
        )
        self.popover = popover
    }

    func update(connectivity: ConnectivitySnapshot) {
        guard let button = statusItem?.button else { return }
        switch connectivity.state {
        case .healthy:
            button.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "Entitlement OS — healthy")
        case .authRequired:
            button.image = NSImage(systemSymbolName: "building.2.crop.circle.badge.exclamationmark", accessibilityDescription: "Entitlement OS — auth required")
        case .degraded:
            button.image = NSImage(systemSymbolName: "building.2.crop.circle", accessibilityDescription: "Entitlement OS — degraded")
        case .failed:
            button.image = NSImage(systemSymbolName: "network.slash", accessibilityDescription: "Entitlement OS — unreachable")
        default:
            button.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "Entitlement OS")
        }
    }

    @objc func togglePopover() {
        guard let button = statusItem?.button, let popover else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }
}
