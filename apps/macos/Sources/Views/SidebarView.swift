import SwiftUI

struct SidebarView: View {
    @Bindable var store: AppStore

    var body: some View {
        List(selection: $store.selectedRoute) {
            Section("Operator Surfaces") {
                ForEach(DesktopRoute.allCases) { route in
                    SidebarRow(route: route)
                        .tag(route)
                }
            }

            Section("Environment") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(store.endpointConfiguration.baseURL)
                        .font(.callout)
                        .lineLimit(1)

                    Text(store.lastRefreshLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .listStyle(.sidebar)
        .onChange(of: store.selectedRoute) { _, newValue in
            store.select(route: newValue)
        }
    }
}

private struct SidebarRow: View {
    let route: DesktopRoute

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: route.systemImage)
                .frame(width: 16)
                .foregroundStyle(.secondary)

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
    }
}
