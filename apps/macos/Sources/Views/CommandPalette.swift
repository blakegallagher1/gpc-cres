import SwiftUI

struct CommandPaletteView: View {
    @Binding var isPresented: Bool
    let onSelect: (DesktopRoute) -> Void

    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var filteredRoutes: [DesktopRoute] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        guard q.isEmpty == false else { return DesktopRoute.allCases }
        return DesktopRoute.allCases.filter {
            $0.title.lowercased().contains(q) || $0.path.contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Jump to route...", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($searchFocused)
                    .onSubmit {
                        if let first = filteredRoutes.first {
                            onSelect(first)
                            isPresented = false
                        }
                    }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredRoutes) { route in
                        PaletteRow(route: route) {
                            onSelect(route)
                            isPresented = false
                        }
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .frame(width: 480)
        .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
        .onAppear { searchFocused = true }
    }
}

private struct PaletteRow: View {
    let route: DesktopRoute
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: route.systemImage)
                    .frame(width: 18)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(route.title)
                    Text(route.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(isHovered ? Color.primary.opacity(0.07) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}
