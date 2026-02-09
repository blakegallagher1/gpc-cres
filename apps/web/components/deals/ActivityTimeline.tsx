"use client";

import { useEffect, useState } from "react";
import { Play, CheckCircle2, Upload, MessageSquare } from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface ActivityItem {
  type: "run" | "task" | "upload" | "message";
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  run: { icon: Play, color: "text-purple-500" },
  task: { icon: CheckCircle2, color: "text-blue-500" },
  upload: { icon: Upload, color: "text-green-500" },
  message: { icon: MessageSquare, color: "text-gray-500" },
};

interface ActivityTimelineProps {
  dealId: string;
}

export function ActivityTimeline({ dealId }: ActivityTimelineProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/deals/${dealId}/activity`);
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.activity || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  if (loading) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Loading activity...</p>;
  }

  if (items.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-4">
        {items.map((item, i) => {
          const config = typeConfig[item.type] || typeConfig.message;
          const Icon = config.icon;
          return (
            <div key={i} className="relative flex items-start gap-3">
              <div className={`absolute left-[-13px] flex h-6 w-6 items-center justify-center rounded-full bg-background border ${config.color}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{item.description}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(item.timestamp)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
