"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Bot, CheckCircle, Clock, Zap } from "lucide-react";

interface RunRow {
  id: string;
  runType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  dealId: string | null;
}

interface AgentsData {
  runs: RunRow[];
  total: number;
  page: number;
  stats: { total24h: number; successRate: number };
  dailyByRunType: Array<{ runType: string; count: number }>;
}

interface Props {
  data: AgentsData | undefined;
  isLoading: boolean;
}

function statusBadge(status: string) {
  const variant = status === "succeeded" ? "default" : status === "failed" ? "destructive" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AgentsTab({ data, isLoading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const kpis = [
    { label: "Runs (24h)", value: data.stats.total24h, icon: Bot },
    { label: "Success Rate", value: `${data.stats.successRate}%`, icon: CheckCircle },
    { label: "Total Runs", value: data.total, icon: Zap },
  ];

  return (
    <div className="space-y-6 pt-4">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typeof value === "number" ? value.toLocaleString() : value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Runs by Type chart */}
      {data.dailyByRunType.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Runs by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.dailyByRunType}>
                <XAxis dataKey="runType" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Runs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No agent runs recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.runs.map((run) => (
                  <>
                    <TableRow
                      key={run.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                    >
                      <TableCell>
                        <Badge variant="outline">{run.runType}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell className="text-sm">
                        {formatDuration(run.durationMs)}
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]">
                        {run.dealId ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelativeTime(run.startedAt)}
                      </TableCell>
                    </TableRow>
                    {expandedId === run.id && run.error && (
                      <TableRow key={`${run.id}-detail`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="text-sm">
                            <span className="font-medium text-destructive">Error:</span>
                            <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap">
                              {run.error}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
