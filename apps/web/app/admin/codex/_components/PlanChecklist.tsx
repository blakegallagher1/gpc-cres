import { CheckSquare2, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanStep } from "../_lib/codex-protocol";

interface PlanChecklistProps {
  steps: PlanStep[];
}

export function PlanChecklist({ steps }: PlanChecklistProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-gray-800 bg-gray-900 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-200">Execution Plan</p>
      <div className="space-y-1">
        {steps.map((step) => {
          return (
            <div key={step.id} className="flex items-center gap-2 text-xs text-gray-300">
              <span
                className={cn(
                  "rounded-full p-0.5",
                  step.completed ? "text-emerald-300" : "text-gray-500",
                )}
              >
                {step.completed ? <CheckSquare2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
              </span>
              <span className={cn(step.completed ? "text-gray-100" : "text-gray-400")}>{step.text}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
