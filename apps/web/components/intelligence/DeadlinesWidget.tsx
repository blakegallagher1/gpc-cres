"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  Clock,
  AlertTriangle,
  AlertCircle,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Urgency = "green" | "yellow" | "red" | "black";

interface DeadlineItem {
  taskId: string;
  taskTitle: string;
  dueAt: string;
  hoursUntilDue: number;
  urgency: Urgency;
  status: string;
  pipelineStep: number;
  dealId: string;
  dealName: string;
  dealStatus: string;
}

function formatDue(hoursUntilDue: number): string {
  if (hoursUntilDue <= -48) {
    const days = Math.abs(Math.round(hoursUntilDue / 24));
    return `${days}d overdue`;
  }
  if (hoursUntilDue <= 0) {
    const hours = Math.abs(Math.round(hoursUntilDue));
    return hours === 0 ? "due now" : `${hours}h overdue`;
  }
  if (hoursUntilDue < 24) return `${Math.round(hoursUntilDue)}h`;
  const days = Math.round(hoursUntilDue / 24);
  return `${days}d`;
}

const urgencyDotStyles: Record<Urgency, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  black: "bg-zinc-900 dark:bg-zinc-100",
};

const urgencyTextStyles: Record<Urgency, string> = {
  green: "text-green-700 dark:text-green-400",
  yellow: "text-yellow-700 dark:text-yellow-400",
  red: "text-red-700 dark:text-red-400",
  black: "text-zinc-900 dark:text-zinc-100",
};

function UrgencyIcon({ urgency }: { urgency: Urgency }) {
  if (urgency === "black" || urgency === "red") {
    return <AlertCircle className="h-3.5 w-3.5" />;
  }
  if (urgency === "yellow") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }
  return <Clock className="h-3.5 w-3.5" />;
}

export function DeadlinesWidget() {
  const { data, isLoading } = useSWR<{
    deadlines: DeadlineItem[];
    total: number;
  }>("/api/intelligence/deadlines", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const deadlines = data?.deadlines ?? [];
  const total = data?.total ?? 0;

  // Count by urgency
  const counts = { black: 0, red: 0, yellow: 0, green: 0 };
  for (const d of deadlines) {
    counts[d.urgency]++;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <Calendar className="h-4 w-4 text-red-500" />
            </div>
            <CardTitle className="text-base">Deadlines</CardTitle>
            {total > 0 && (
              <Badge
                variant={
                  counts.black > 0 || counts.red > 0
                    ? "destructive"
                    : "secondary"
                }
                className="ml-1"
              >
                {total}
              </Badge>
            )}
          </div>

          {/* Urgency summary pills */}
          {total > 0 && (
            <div className="flex items-center gap-1.5">
              {counts.black > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {counts.black} overdue
                </span>
              )}
              {counts.red > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-400">
                  {counts.red} urgent
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : deadlines.length > 0 ? (
          <div className="space-y-1.5">
            {deadlines.slice(0, 8).map((d) => (
              <Link
                key={d.taskId}
                href={`/deals/${d.dealId}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    urgencyTextStyles[d.urgency],
                    d.urgency === "black"
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : d.urgency === "red"
                        ? "bg-red-50 dark:bg-red-950/30"
                        : d.urgency === "yellow"
                          ? "bg-yellow-50 dark:bg-yellow-950/30"
                          : "bg-green-50 dark:bg-green-950/30"
                  )}
                >
                  <UrgencyIcon urgency={d.urgency} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.taskTitle}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.dealName}
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    urgencyTextStyles[d.urgency]
                  )}
                >
                  {formatDue(d.hoursUntilDue)}
                </span>
              </Link>
            ))}

            {total > 8 && (
              <div className="pt-1 text-center">
                <Button variant="ghost" size="sm" className="text-xs" asChild>
                  <Link href="/deals">
                    View all {total} deadlines
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No upcoming deadlines.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Tasks with due dates will appear here sorted by urgency.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
