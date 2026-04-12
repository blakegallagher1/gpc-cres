import SwiftUI

struct CommandPaletteView: View {
    @Binding var isPresented: Bool
    let onSelect: (DesktopRoute) -> Void

    @State private var query = ""
    @State private var highlightedIndex = 0
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
                        let index = min(highlightedIndex, max(filteredRoutes.count - 1, 0))
                        if filteredRoutes.indices.contains(index) {
                            onSelect(filteredRoutes[index])
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
                        PaletteRow(
                            route: route,
                            isHighlighted: filteredRoutes[safe: highlightedIndex] == route
                        ) {
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
        .onChange(of: query) { _, _ in
            highlightedIndex = 0
        }
        .onExitCommand { isPresented = false }
        .onMoveCommand { direction in
            guard filteredRoutes.isEmpty == false else { return }
            switch direction {
            case .down:
                highlightedIndex = min(highlightedIndex + 1, filteredRoutes.count - 1)
            case .up:
                highlightedIndex = max(highlightedIndex - 1, 0)
            default:
                break
            }
        }
    }
}

private struct PaletteRow: View {
    let route: DesktopRoute
    let isHighlighted: Bool
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
            .background((isHovered || isHighlighted) ? Color.primary.opacity(0.07) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
