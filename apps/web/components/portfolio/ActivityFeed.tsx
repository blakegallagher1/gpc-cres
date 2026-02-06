"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ActivityEvent } from "@/lib/data/mockPortfolio";
import { timeAgo } from "@/lib/utils";
import { Plus, ArrowRightLeft, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const EVENT_CONFIG: Record<
  ActivityEvent["type"],
  { icon: React.ElementType; color: string }
> = {
  deal_created: { icon: Plus, color: "text-blue-500" },
  status_changed: { icon: ArrowRightLeft, color: "text-amber-500" },
  triage_completed: { icon: CheckCircle2, color: "text-emerald-500" },
  artifact_generated: { icon: FileText, color: "text-violet-500" },
};

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

          {events.map((event, i) => {
            const config = EVENT_CONFIG[event.type];
            const Icon = config.icon;
            return (
              <div
                key={event.id}
                className={cn(
                  "relative flex gap-3 py-2.5",
                  i === 0 && "pt-0"
                )}
              >
                <div
                  className={cn(
                    "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border",
                    config.color
                  )}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">
                    <span className="font-medium">{event.dealName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.description}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
