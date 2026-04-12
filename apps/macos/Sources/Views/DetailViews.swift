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

struct MetricCard: View {
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

struct SurfaceCard<Content: View>: View {
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
func paneHeader(title: String, subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(title)
            .font(.title2.weight(.semibold))

        Text(subtitle)
            .font(.callout)
            .foregroundStyle(.secondary)
    }
}

// MARK: - Per-route panes

struct ChatPane: View {
    let snapshot: ChatSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Chat", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "convos", label: "Conversations", value: "\(snapshot.conversationCount)", detail: "Total loaded"))
                    MetricCard(metric: OperatorMetric(id: "msgs", label: "Messages Today", value: "\(snapshot.messagesToday)", detail: "Updated this session"))
                }

                SurfaceCard(title: "Last Active Agent", subtitle: "Most recent conversation") {
                    Text(snapshot.lastActiveAgent)
                        .font(.headline)
                }
            }
            .padding(24)
        }
    }
}

struct CommandCenterPane: View {
    let snapshot: CommandCenterSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Command Center", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "collisions", label: "Memory Collisions", value: "\(snapshot.collisions)", detail: "Entity conflicts"))
                    MetricCard(metric: OperatorMetric(id: "queue", label: "Innovation Queue", value: "\(snapshot.innovationQueueDepth)", detail: "Pending items"))
                    MetricCard(metric: OperatorMetric(id: "drift", label: "Drift Alerts", value: "\(snapshot.driftAlerts)", detail: "Active alerts"))
                }

                SurfaceCard(title: "Briefing Date", subtitle: "Last daily briefing generated") {
                    Text(snapshot.briefingDate)
                        .font(.headline)
                }
            }
            .padding(24)
        }
    }
}

struct OpportunitiesPane: View {
    let snapshot: OpportunitiesSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Opportunities", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "screened", label: "Top Screened", value: "\(snapshot.screenedCount)", detail: "Returned from API"))
                    MetricCard(metric: OperatorMetric(id: "avg", label: "Avg Score", value: snapshot.avgScore, detail: "Top results"))
                }

                if snapshot.topParcelAddresses.isEmpty == false {
                    SurfaceCard(title: "Top Parcels", subtitle: "Highest scored") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.topParcelAddresses, id: \.self) { address in
                                Label(address, systemImage: "mappin")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct MarketPane: View {
    let snapshot: MarketSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Market Intel", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "alerts", label: "Alerts", value: "\(snapshot.alertCount)", detail: "Active market alerts"))
                    MetricCard(metric: OperatorMetric(id: "corridors", label: "Corridors", value: "\(snapshot.monitoredCorridors.count)", detail: "Monitored"))
                }

                SurfaceCard(title: "Briefing Date", subtitle: "Last daily briefing") {
                    Text(snapshot.briefingDate)
                        .font(.headline)
                }

                if snapshot.monitoredCorridors.isEmpty == false {
                    SurfaceCard(title: "Monitored Corridors", subtitle: "Active market coverage") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.monitoredCorridors, id: \.self) { corridor in
                                Label(corridor, systemImage: "chart.line.uptrend.xyaxis")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct PortfolioPane: View {
    let snapshot: PortfolioSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Portfolio", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "count", label: "Properties", value: "\(snapshot.propertyCount)", detail: "In portfolio"))
                    MetricCard(metric: OperatorMetric(id: "value", label: "Total Value", value: snapshot.totalValueLabel, detail: "Portfolio estimate"))
                    MetricCard(metric: OperatorMetric(id: "debt", label: "Debt Alerts", value: "\(snapshot.debtAlerts)", detail: "Maturing or at risk"))
                }
            }
            .padding(24)
        }
    }
}

struct WealthPane: View {
    let snapshot: WealthSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Wealth", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "networth", label: "Net Worth", value: snapshot.netWorthLabel, detail: "Snapshot"))
                    MetricCard(metric: OperatorMetric(id: "entities", label: "Entities", value: "\(snapshot.entityCount)", detail: "Active entities"))
                    MetricCard(metric: OperatorMetric(id: "tax", label: "Tax Alerts", value: "\(snapshot.taxAlerts)", detail: "Require attention"))
                }
            }
            .padding(24)
        }
    }
}

struct AgentsPane: View {
    let snapshot: AgentsSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Agents", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "active", label: "Active", value: "\(snapshot.activeCount)", detail: "Running now"))
                    MetricCard(metric: OperatorMetric(id: "errors", label: "Errors", value: "\(snapshot.errorCount)", detail: "Failed runs"))
                }

                if snapshot.lastRunLabels.isEmpty == false {
                    SurfaceCard(title: "Recent Runs", subtitle: "Last 3") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.lastRunLabels, id: \.self) { label in
                                Label(label, systemImage: "bolt.horizontal.circle")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct WorkflowsPane: View {
    let snapshot: WorkflowsSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Workflows", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "active", label: "Active", value: "\(snapshot.activeCount)", detail: "Running workflows"))
                    MetricCard(metric: OperatorMetric(id: "last", label: "Last Status", value: snapshot.lastRunStatus, detail: "Most recent run"))
                }
            }
            .padding(24)
        }
    }
}

struct NotificationsPane: View {
    let snapshot: NotificationsSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Notifications", subtitle: "Last refresh \(lastRefreshLabel)")

                MetricCard(
                    metric: OperatorMetric(
                        id: "unread",
                        label: "Unread",
                        value: "\(snapshot.unreadCount)",
                        detail: "Unread production notifications"
                    )
                )

                if snapshot.latestTitles.isEmpty {
                    SurfaceCard(title: "Recent Notifications", subtitle: "No items returned") {
                        Text("No notifications were returned from the production API.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    SurfaceCard(title: "Recent Notifications", subtitle: "Latest 5") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(snapshot.latestTitles, id: \.self) { title in
                                Label(title, systemImage: "bell")
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct AdminPane: View {
    let snapshot: AdminSnapshot
    let lastRefreshLabel: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                paneHeader(title: "Admin", subtitle: "Last refresh \(lastRefreshLabel)")

                LazyVGrid(columns: [GridItem(.flexible(minimum: 140)), GridItem(.flexible(minimum: 140))], spacing: 16) {
                    MetricCard(metric: OperatorMetric(id: "db", label: "Database", value: snapshot.dbStatus, detail: "Live health check"))
                    MetricCard(metric: OperatorMetric(id: "sentinel", label: "Sentinel Alerts", value: "\(snapshot.sentinelAlerts)", detail: "Active alerts"))
                    MetricCard(metric: OperatorMetric(id: "containers", label: "Containers", value: snapshot.containerHealth, detail: "Docker health"))
                }
            }
            .padding(24)
        }
    }
}
