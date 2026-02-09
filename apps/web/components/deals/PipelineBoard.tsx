"use client";

import { TaskCard, type TaskItem } from "./TaskCard";

const PIPELINE_STEPS = [
  { step: 1, label: "Land Scouting" },
  { step: 2, label: "Deal Screening" },
  { step: 3, label: "Due Diligence" },
  { step: 4, label: "Entitlements" },
  { step: 5, label: "Design" },
  { step: 6, label: "Finance" },
  { step: 7, label: "Construction" },
  { step: 8, label: "Disposition" },
];

interface PipelineBoardProps {
  tasks: TaskItem[];
  onTaskStatusChange?: (taskId: string, newStatus: string) => void;
  onTaskUpdate?: (taskId: string, updates: { title?: string; description?: string; status?: string; dueAt?: string | null }) => void;
}

export function PipelineBoard({ tasks, onTaskStatusChange, onTaskUpdate }: PipelineBoardProps) {
  return (
    <div className="space-y-6">
      {PIPELINE_STEPS.map(({ step, label }) => {
        const stepTasks = tasks.filter((t) => t.pipelineStep === step);
        const doneCount = stepTasks.filter((t) => t.status === "DONE").length;

        return (
          <div key={step}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {step}
              </span>
              <h3 className="text-sm font-medium">{label}</h3>
              {stepTasks.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {doneCount}/{stepTasks.length} done
                </span>
              )}
            </div>
            {stepTasks.length > 0 ? (
              <div className="ml-8 space-y-2">
                {stepTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={onTaskStatusChange}
                    onTaskUpdate={onTaskUpdate}
                  />
                ))}
              </div>
            ) : (
              <p className="ml-8 text-xs text-muted-foreground">No tasks for this step</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
