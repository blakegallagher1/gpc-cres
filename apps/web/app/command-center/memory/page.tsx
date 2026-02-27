"use client";

import { useState } from "react";
import useSWR from "swr";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Brain,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const STATUS_COLORS: Record<string, string> = {
  attempted: "#6366f1",
  accepted: "#22c55e",
  rejected: "#ef4444",
  conflicted: "#f59e0b",
};

const FACT_TYPE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#64748b",
];

interface StatsData {
  total: number;
  byStatus: { status: string; count: number }[];
  byFactType: { factType: string; count: number }[];
  bySourceType: { sourceType: string; count: number }[];
  recentEvents: Array<{
    id: string;
    factType: string;
    sourceType: string;
    status: string;
    toolName: string | null;
    timestamp: string;
    entity: {
      id: string;
      canonicalAddress: string | null;
      parcelId: string | null;
      type: string;
    };
  }>;
  days: number;
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "rejected":
      return "destructive";
    case "conflicted":
      return "outline";
    default:
      return "secondary";
  }
}

export default function MemoryDashboardPage() {
  const [days, setDays] = useState(7);

  const { data, isLoading } = useSWR<StatsData>(
    `/api/memory/events?days=${days}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const total = data?.total ?? 0;
  const statusMap = Object.fromEntries(
    (data?.byStatus ?? []).map((s) => [s.status, s.count]),
  );
  const acceptedPct = total > 0 ? ((statusMap.accepted ?? 0) / total) * 100 : 0;
  const rejectedPct = total > 0 ? ((statusMap.rejected ?? 0) / total) * 100 : 0;
  const conflictedPct =
    total > 0 ? ((statusMap.conflicted ?? 0) / total) * 100 : 0;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Memory Event Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Agent memory instrumentation — every fact attempted, accepted,
              rejected, or conflicted.
            </p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Events"
            value={total}
            icon={<Brain className="h-4 w-4 text-muted-foreground" />}
            loading={isLoading}
          />
          <StatCard
            title="Accepted"
            value={`${acceptedPct.toFixed(1)}%`}
            icon={<CheckCircle className="h-4 w-4 text-green-500" />}
            loading={isLoading}
          />
          <StatCard
            title="Rejected"
            value={`${rejectedPct.toFixed(1)}%`}
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            loading={isLoading}
          />
          <StatCard
            title="Conflicted"
            value={`${conflictedPct.toFixed(1)}%`}
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            loading={isLoading}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status Distribution Bar Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Events by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data?.byStatus ?? []}>
                    <XAxis dataKey="status" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(data?.byStatus ?? []).map((entry, i) => (
                        <Cell
                          key={i}
                          fill={STATUS_COLORS[entry.status] ?? "#64748b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Fact Type Pie Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4" />
                Distribution by Fact Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data?.byFactType ?? []}
                      dataKey="count"
                      nameKey="factType"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name }: { name?: string }) => name ?? ""}
                      fontSize={11}
                    >
                      {(data?.byFactType ?? []).map((_, i) => (
                        <Cell
                          key={i}
                          fill={FACT_TYPE_COLORS[i % FACT_TYPE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend fontSize={11} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Events Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (data?.recentEvents ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No memory events recorded yet. Events will appear here as agents
                discover and validate facts.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Timestamp</th>
                      <th className="pb-2 pr-4 font-medium">Entity</th>
                      <th className="pb-2 pr-4 font-medium">Fact Type</th>
                      <th className="pb-2 pr-4 font-medium">Source</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Tool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentEvents ?? []).map((event) => (
                      <tr key={event.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          {event.entity.canonicalAddress ??
                            event.entity.parcelId ??
                            event.entity.id.slice(0, 8)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">{event.factType}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary">{event.sourceType}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={statusBadgeVariant(event.status)}>
                            {event.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {event.toolName ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
