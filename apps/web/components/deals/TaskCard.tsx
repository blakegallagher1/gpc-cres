"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, Pencil, Save, X } from "lucide-react";

const statusFlow = ["TODO", "IN_PROGRESS", "DONE"] as const;

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  TODO: { label: "To Do", className: "text-gray-500", icon: Circle },
  IN_PROGRESS: { label: "In Progress", className: "text-blue-500", icon: Loader2 },
  BLOCKED: { label: "Blocked", className: "text-red-500", icon: Circle },
  DONE: { label: "Done", className: "text-green-500", icon: CheckCircle2 },
  CANCELED: { label: "Canceled", className: "text-gray-400 line-through", icon: Circle },
};

const allStatuses = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELED"];

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
  onTaskUpdate?: (taskId: string, updates: { title?: string; description?: string; status?: string; dueAt?: string | null }) => void;
}

export function TaskCard({ task, onStatusChange, onTaskUpdate }: TaskCardProps) {
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || "");
  const [editStatus, setEditStatus] = useState(task.status);
  const [editDueAt, setEditDueAt] = useState(task.dueAt?.slice(0, 10) || "");

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

  const handleSave = async () => {
    if (!onTaskUpdate) return;
    setUpdating(true);
    try {
      await onTaskUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        status: editStatus,
        dueAt: editDueAt || null,
      });
      setEditing(false);
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditStatus(task.status);
    setEditDueAt(task.dueAt?.slice(0, 10) || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <Card>
        <CardContent className="space-y-2 p-3">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Task title"
            className="h-8 text-sm"
          />
          <Input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description (optional)"
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusConfig[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={editDueAt}
              onChange={(e) => setEditDueAt(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={updating}>
                <Save className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

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
        {onTaskUpdate && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
