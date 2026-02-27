"use client";

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
import { TrendingUp, TrendingDown } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface CounterfactualLog {
  id: string;
  dealId: string;
  outcome: string;
  rejectionReason: string | null;
  stageAtClose: string;
  lessonsLearned: string | null;
  createdAt: string;
}

const OUTCOME_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  won: "default",
  lost: "destructive",
  passed: "outline",
  expired: "secondary",
};

export default function CounterfactualPage() {
  const { data, isLoading } = useSWR<{
    logs: CounterfactualLog[];
    summary: Record<string, number>;
  }>("/api/memory/counterfactual", fetcher, { revalidateOnFocus: false });

  const logs = data?.logs ?? [];
  const summary = data?.summary ?? {};
  const totalDeals = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Counterfactual Learning
          </h1>
          <p className="text-sm text-muted-foreground">
            Portfolio-level deal outcomes — what was won, lost, or passed on, and
            why.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Logged</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">{totalDeals}</div>
              )}
            </CardContent>
          </Card>
          {["won", "lost", "passed", "expired"].map((outcome) => (
            <Card key={outcome}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {outcome}
                </CardTitle>
                {outcome === "won" ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                )}
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{summary[outcome] ?? 0}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deal Outcome Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No counterfactual outcomes logged yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium">Deal</th>
                      <th className="pb-2 pr-4 font-medium">Outcome</th>
                      <th className="pb-2 pr-4 font-medium">Stage</th>
                      <th className="pb-2 font-medium">Reason / Lessons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4">{log.dealId.slice(0, 8)}...</td>
                        <td className="py-2 pr-4">
                          <Badge variant={OUTCOME_BADGE[log.outcome] ?? "secondary"}>
                            {log.outcome}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">{log.stageAtClose}</td>
                        <td className="py-2 text-muted-foreground">
                          {log.rejectionReason ?? log.lessonsLearned ?? "—"}
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
