import SwiftUI

struct OverviewPane: View {
    let snapshot: OperatorSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(snapshot.statusLine)
                    .font(.title2.weight(.semibold))

                LazyVGrid(columns: [
                    GridItem(.flexible(minimum: 180)),
                    GridItem(.flexible(minimum: 180)),
                    GridItem(.flexible(minimum: 180))
                ], spacing: 16) {
                    ForEach(snapshot.metrics) { metric in
                        MetricCard(metric: metric)
                    }
                }

                SurfaceCard(title: "Operator Focus", subtitle: "Last refresh \(lastRefreshLabel)") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(snapshot.focusItems, id: \.self) { item in
                            Label(item, systemImage: "checkmark.circle")
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct DealsPane: View {
    let records: [DealRecord]
    let lastRefreshLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            paneHeader(title: "Deal Workspace", subtitle: "Last refresh \(lastRefreshLabel)")

            Table(records) {
                TableColumn("Name") { record in
                    Text(record.name)
                }
                TableColumn("Stage") { record in
                    Text(record.stage)
                }
                TableColumn("Location") { record in
                    Text(record.location)
                }
                TableColumn("Score") { record in
                    Text(record.score)
                }
                TableColumn("Updated") { record in
                    Text(record.updatedAt)
                }
            }
        }
        .padding(24)
    }
}

struct RunsPane: View {
    let records: [RunRecord]
    let lastRefreshLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            paneHeader(title: "Run Monitor", subtitle: "Last refresh \(lastRefreshLabel)")

            Table(records) {
                TableColumn("Run") { record in
                    Text(record.title)
                }
                TableColumn("Status") { record in
                    Text(record.status)
                }
                TableColumn("Started") { record in
                    Text(record.startedAt)
                }
                TableColumn("Summary") { record in
                    Text(record.summary)
                        .lineLimit(2)
                }
            }
        }
        .padding(24)
    }
}

struct MapPane: View {
    let record: MapRecord
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                paneHeader(title: "Map Workspace", subtitle: "Last refresh \(lastRefreshLabel)")

                HStack(spacing: 16) {
                    SurfaceCard(title: "Active Workspace", subtitle: record.activeWorkspaceLabel) {
                        Text(record.selectedParcelsLabel)
                            .font(.headline)
                    }

                    SurfaceCard(title: "Operator Guidance", subtitle: "Desktop bridge to the map surfaces") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(record.outlookItems, id: \.self) { item in
                                Text(item)
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct AutomationPane: View {
    let records: [AutomationRecord]
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                paneHeader(title: "Automation Watch", subtitle: "Last refresh \(lastRefreshLabel)")

                ForEach(records, id: \.title) { record in
                    SurfaceCard(title: record.title, subtitle: "Automation event") {
                        Text(record.summary)
                    }
                }
            }
            .padding(24)
        }
    }
}

struct MemoryPane: View {
    let snapshot: OperatorSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                paneHeader(title: "Memory Systems", subtitle: "Last refresh \(lastRefreshLabel)")

                SurfaceCard(title: "Learning State", subtitle: snapshot.statusLine) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(snapshot.focusItems, id: \.self) { item in
                            Text(item)
                        }
                    }
                }

                LazyVGrid(columns: [
                    GridItem(.flexible(minimum: 180)),
                    GridItem(.flexible(minimum: 180))
                ], spacing: 16) {
                    ForEach(snapshot.metrics) { metric in
                        MetricCard(metric: metric)
                    }
                }
            }
            .padding(24)
        }
    }
}

private struct MetricCard: View {
    let metric: OperatorMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(metric.label)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(metric.value)
                .font(.title2.weight(.semibold))

            Text(metric.detail)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct SurfaceCard<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

@ViewBuilder
private func paneHeader(title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(title)
            .font(.title2.weight(.semibold))

        Text(subtitle)
            .font(.callout)
            .foregroundStyle(.secondary)
    }
}
