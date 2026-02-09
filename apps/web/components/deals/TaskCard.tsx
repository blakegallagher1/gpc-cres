"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const statusFlow = ["TODO", "IN_PROGRESS", "DONE"] as const;

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  TODO: { label: "To Do", className: "text-gray-500", icon: Circle },
  IN_PROGRESS: { label: "In Progress", className: "text-blue-500", icon: Loader2 },
  BLOCKED: { label: "Blocked", className: "text-red-500", icon: Circle },
  DONE: { label: "Done", className: "text-green-500", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", className: "text-gray-400 line-through", icon: Circle },
};

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  pipelineStep: number;
  ownerUserId?: string | null;
  dueAt?: string | null;
}

interface TaskCardProps {
  task: TaskItem;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

export function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const [updating, setUpdating] = useState(false);
  const config = statusConfig[task.status] ?? statusConfig.TODO;
  const Icon = config.icon;

  const cycleStatus = async () => {
    if (!onStatusChange) return;
    const currentIdx = statusFlow.indexOf(task.status as (typeof statusFlow)[number]);
    if (currentIdx === -1) return;
    const nextIdx = (currentIdx + 1) % statusFlow.length;
    const nextStatus = statusFlow[nextIdx];
    setUpdating(true);
    try {
      await onStatusChange(task.id, nextStatus);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card className={cn("transition-all", task.status === "DONE" && "opacity-60")}>
      <CardContent className="flex items-start gap-3 p-3">
        <Button
          variant="ghost"
          size="icon"
          className={cn("mt-0.5 h-6 w-6 shrink-0", config.className)}
          onClick={cycleStatus}
          disabled={updating}
        >
          <Icon className={cn("h-4 w-4", task.status === "IN_PROGRESS" && "animate-spin")} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", task.status === "DONE" && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {config.label}
        </Badge>
      </CardContent>
    </Card>
  );
}
