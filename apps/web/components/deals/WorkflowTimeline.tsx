"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WorkflowStageItem = {
  id: string;
  key: string;
  name: string;
  ordinal: number;
  description?: string | null;
  requiredGate?: string | null;
};

type StageHistoryItem = {
  id: string;
  fromStageKey: string | null;
  toStageKey: string;
  changedAt: string;
  note?: string | null;
};

type WorkflowTimelineProps = {
  currentStageKey: string | null;
  workflowTemplate: {
    name: string;
    stages: WorkflowStageItem[];
  } | null;
  stageHistory: StageHistoryItem[];
};

type StageState = "completed" | "current" | "upcoming";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const stateStyles: Record<StageState, { badge: string; dot: string; line: string }> = {
  completed: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "border-emerald-400 bg-emerald-500",
    line: "bg-emerald-200",
  },
  current: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "border-sky-500 bg-sky-500",
    line: "bg-slate-200",
  },
  upcoming: {
    badge: "border-slate-200 bg-slate-50 text-slate-500",
    dot: "border-slate-300 bg-white",
    line: "bg-slate-200",
  },
};

export function WorkflowTimeline({
  currentStageKey,
  workflowTemplate,
  stageHistory,
}: WorkflowTimelineProps) {
  if (!workflowTemplate || workflowTemplate.stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No workflow template is attached to this deal yet.
      </p>
    );
  }

  const completedKeys = new Set(stageHistory.map((entry) => entry.toStageKey));
  const stageHistoryMap = new Map<string, StageHistoryItem>();

  for (const entry of stageHistory) {
    stageHistoryMap.set(entry.toStageKey, entry);
  }

  const currentIndex = workflowTemplate.stages.findIndex(
    (stage) => stage.key === currentStageKey,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{workflowTemplate.name}</p>
          <p className="text-xs text-muted-foreground">
            Stage progress follows the attached workflow template.
          </p>
        </div>
        {currentStageKey ? (
          <Badge variant="outline" className="uppercase tracking-wide">
            {currentStageKey.replace(/_/g, " ")}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-4">
        {workflowTemplate.stages.map((stage, index) => {
          const state: StageState =
            stage.key === currentStageKey
              ? "current"
              : currentIndex >= 0 && index < currentIndex
                ? "completed"
                : completedKeys.has(stage.key)
                  ? "completed"
                  : "upcoming";
          const historyEntry = stageHistoryMap.get(stage.key);
          const stateLabel =
            state === "current"
              ? "Current Stage"
              : state === "completed"
                ? "Completed"
                : "Upcoming";

          return (
            <div key={stage.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                    stateStyles[state].dot,
                    state === "current" ? "text-white" : "text-slate-600",
                  )}
                >
                  {stage.ordinal}
                </div>
                {index < workflowTemplate.stages.length - 1 ? (
                  <div className={cn("mt-2 h-full min-h-10 w-px", stateStyles[state].line)} />
                ) : null}
              </div>

              <div className="flex-1 rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{stage.name}</p>
                  <Badge variant="outline" className={stateStyles[state].badge}>
                    {stateLabel}
                  </Badge>
                  {stage.requiredGate ? (
                    <span className="text-xs text-muted-foreground">
                      Gate: {stage.requiredGate}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {stage.key.replace(/_/g, " ")}
                </p>
                {stage.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{stage.description}</p>
                ) : null}
                {historyEntry ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Reached {formatDateTime(historyEntry.changedAt)}</p>
                    {historyEntry.note ? <p>{historyEntry.note}</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
