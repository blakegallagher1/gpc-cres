// apps/web/components/admin/overview-tab.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Database, Brain, Bot, Building2 } from "lucide-react";

interface OverviewData {
  knowledgeCount: number;
  verifiedCount: number;
  entityCount: number;
  runs24h: number;
  recentActivity: Array<{ type: string; summary: string; createdAt: string }>;
  knowledgeByType: Array<{ contentType: string; count: number }>;
}

interface Props {
  data: OverviewData | undefined;
  isLoading: boolean;
}

const kpiCards = [
  { key: "knowledgeCount", label: "Knowledge Entries", icon: Database },
  { key: "verifiedCount", label: "Verified Memories", icon: Brain },
  { key: "entityCount", label: "Entities Tracked", icon: Building2 },
  { key: "runs24h", label: "Agent Runs (24h)", icon: Bot },
] as const;

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OverviewTab({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="space-y-6 pt-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(data[key] as number).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.recentActivity.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {event.type}
                      </Badge>
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {event.summary}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Knowledge by Type */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Knowledge by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {data.knowledgeByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No knowledge entries yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.knowledgeByType}
                  layout="vertical"
                  margin={{ left: 100 }}
                >
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="contentType" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
