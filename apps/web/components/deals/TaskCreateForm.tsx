"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { TaskItem } from "./TaskCard";

const PIPELINE_STEPS = [
  { value: "1", label: "1 - Land Scouting" },
  { value: "2", label: "2 - Deal Screening" },
  { value: "3", label: "3 - Due Diligence" },
  { value: "4", label: "4 - Entitlements" },
  { value: "5", label: "5 - Design" },
  { value: "6", label: "6 - Finance" },
  { value: "7", label: "7 - Construction" },
  { value: "8", label: "8 - Disposition" },
];

interface TaskCreateFormProps {
  dealId: string;
  onTaskCreated: (task: TaskItem) => void;
}

export function TaskCreateForm({ dealId, onTaskCreated }: TaskCreateFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineStep, setPipelineStep] = useState("1");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          pipelineStep: parseInt(pipelineStep, 10),
          dueAt: dueAt || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to create task");
      const data = await res.json();
      onTaskCreated(data.task);
      setTitle("");
      setDescription("");
      setPipelineStep("1");
      setDueAt("");
      setOpen(false);
      toast.success("Task created");
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Task
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <Input
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <Input
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Pipeline Step</label>
          <Select value={pipelineStep} onValueChange={setPipelineStep}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STEPS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Due Date</label>
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
