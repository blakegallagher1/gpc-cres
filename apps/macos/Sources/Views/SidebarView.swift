import SwiftUI

struct SidebarView: View {
    @Bindable var store: AppStore

    private let pinnedRoutes: [DesktopRoute] = [.chat]

    private let operateRoutes: [DesktopRoute] = [
        .commandCenter, .deals, .map
    ]

    private let intelligenceRoutes: [DesktopRoute] = [
        .opportunities, .market, .portfolio, .wealth
    ]

    private let systemRoutes: [DesktopRoute] = [
        .agents, .runs, .automation, .workflows, .reference
    ]

    private let footerRoutes: [DesktopRoute] = [.settings, .admin]

    var body: some View {
        List(selection: $store.selectedRoute) {
            Section("Pinned") {
                routeRows(pinnedRoutes)
            }

            Section("Operate") {
                routeRows(operateRoutes)
            }

            Section("Intelligence") {
                routeRows(intelligenceRoutes)
            }

            Section("System") {
                routeRows(systemRoutes)
            }

            Section("") {
                routeRows(footerRoutes)
            }

            Section("Environment") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(store.endpointConfiguration.baseURL)
                        .font(.callout)
                        .lineLimit(1)

                    Text(store.currentURLString.isEmpty ? store.endpointConfiguration.startPath : store.currentURLString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .padding(.vertical, 4)
            }
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private func routeRows(_ routes: [DesktopRoute]) -> some View {
        ForEach(routes) { route in
            Button {
                store.select(route: route)
            } label: {
                SidebarRow(route: route, isSelected: store.selectedRoute == route)
            }
            .buttonStyle(.plain)
            .tag(route)
        }
    }
}

private struct SidebarRow: View {
    let route: DesktopRoute
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: route.systemImage)
                .frame(width: 16)
                .foregroundStyle(isSelected ? .primary : .secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(route.title)
                    .lineLimit(1)

                Text(route.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}
