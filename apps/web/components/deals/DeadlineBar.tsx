"use client";

import { Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./TaskCard";

interface DeadlineBarProps {
  tasks: TaskItem[];
}

type Urgency = "green" | "yellow" | "red" | "black";

interface DeadlineEntry {
  taskId: string;
  title: string;
  dueAt: Date;
  urgency: Urgency;
  hoursUntilDue: number;
}

function classifyUrgency(dueAt: Date, now: Date): Urgency {
  const hours = (dueAt.getTime() - now.getTime()) / 3600000;
  if (hours <= 0) return "black";
  if (hours <= 24) return "red";
  if (hours <= 72) return "yellow";
  return "green";
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
  if (hoursUntilDue < 24) return `${Math.round(hoursUntilDue)}h left`;
  const days = Math.round(hoursUntilDue / 24);
  return `${days}d left`;
}

const urgencyStyles: Record<Urgency, string> = {
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

const urgencyBgStyles: Record<Urgency, string> = {
  green: "bg-green-50 dark:bg-green-950/30",
  yellow: "bg-yellow-50 dark:bg-yellow-950/30",
  red: "bg-red-50 dark:bg-red-950/30",
  black: "bg-zinc-100 dark:bg-zinc-900/50",
};

function UrgencyIcon({ urgency }: { urgency: Urgency }) {
  if (urgency === "black" || urgency === "red") {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0" />;
  }
  if (urgency === "yellow") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  }
  return <Clock className="h-3.5 w-3.5 shrink-0" />;
}

export function DeadlineBar({ tasks }: DeadlineBarProps) {
  const now = new Date();

  // Filter to only tasks with deadlines that aren't done/canceled
  const entries: DeadlineEntry[] = tasks
    .filter(
      (t) =>
        t.dueAt &&
        t.status !== "DONE" &&
        t.status !== "CANCELED"
    )
    .map((t) => {
      const dueAt = new Date(t.dueAt!);
      const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3600000;
      return {
        taskId: t.id,
        title: t.title,
        dueAt,
        urgency: classifyUrgency(dueAt, now),
        hoursUntilDue,
      };
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  if (entries.length === 0) return null;

  // Compute the worst urgency for the summary bar color
  const urgencyRank: Record<Urgency, number> = { black: 0, red: 1, yellow: 2, green: 3 };
  const worstUrgency = entries.reduce<Urgency>(
    (worst, e) =>
      urgencyRank[e.urgency] < urgencyRank[worst] ? e.urgency : worst,
    "green"
  );

  return (
    <div className={cn("rounded-lg border p-3", urgencyBgStyles[worstUrgency])}>
      {/* Summary bar */}
      <div className="mb-2 flex items-center gap-2">
        <div className={cn("flex items-center gap-1.5 text-xs font-semibold", urgencyTextStyles[worstUrgency])}>
          <UrgencyIcon urgency={worstUrgency} />
          {entries.length} deadline{entries.length !== 1 ? "s" : ""}
        </div>

        {/* Mini bar visualization */}
        <div className="flex flex-1 gap-0.5">
          {entries.map((e) => (
            <div
              key={e.taskId}
              className={cn("h-1.5 flex-1 rounded-full", urgencyStyles[e.urgency])}
              title={`${e.title}: ${formatDue(e.hoursUntilDue)}`}
            />
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-1">
        {entries.slice(0, 5).map((e) => (
          <div key={e.taskId} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={cn("h-2 w-2 shrink-0 rounded-full", urgencyStyles[e.urgency])} />
              <span className="truncate">{e.title}</span>
            </div>
            <span className={cn("shrink-0 font-medium", urgencyTextStyles[e.urgency])}>
              {formatDue(e.hoursUntilDue)}
            </span>
          </div>
        ))}
        {entries.length > 5 && (
          <p className="text-[10px] text-muted-foreground">
            +{entries.length - 5} more
          </p>
        )}
      </div>
    </div>
  );
}
