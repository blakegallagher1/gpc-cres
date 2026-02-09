"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, ChevronRight, Plus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Decision = "ADVANCE" | "HOLD" | "KILL";

const decisionStyles: Record<Decision, { bg: string; text: string; ring: string; icon: React.ElementType }> = {
  ADVANCE: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/30",
    icon: CheckCircle2,
  },
  HOLD: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/30",
    icon: AlertTriangle,
  },
  KILL: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/30",
    icon: XCircle,
  },
};

const riskLabels: Record<string, string> = {
  access: "Access / Ingress",
  drainage: "Drainage / Flood",
  adjacency: "Adjacency Conflicts",
  env: "Environmental",
  utilities: "Utilities",
  politics: "Political / Zoning",
};

function riskBarColor(score: number): string {
  if (score <= 3) return "bg-emerald-500";
  if (score <= 6) return "bg-amber-500";
  return "bg-red-500";
}

interface RiskScores {
  access: number;
  drainage: number;
  adjacency: number;
  env: number;
  utilities: number;
  politics: number;
}

interface Disqualifier {
  label: string;
  detail: string;
  severity: "hard" | "soft";
}

interface NextAction {
  title: string;
  description: string;
  pipeline_step: number;
  due_in_days: number;
}

interface Assumption {
  assumption: string;
  impact: string;
}

interface WebSearchSource {
  url: string;
  title?: string;
}

interface TriageResultPanelProps {
  triage: {
    decision: Decision;
    recommended_path: string;
    rationale: string;
    risk_scores: RiskScores;
    disqualifiers: Disqualifier[];
    next_actions: NextAction[];
    assumptions: Assumption[];
    sources_summary: string[];
  };
  sources?: WebSearchSource[];
  onCreateTask?: (action: NextAction) => Promise<void>;
}

export function TriageResultPanel({ triage, sources, onCreateTask }: TriageResultPanelProps) {
  const style = decisionStyles[triage.decision];
  const DecisionIcon = style.icon;
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);
  const [createdIdxs, setCreatedIdxs] = useState<Set<number>>(new Set());

  const totalRisk = Object.values(triage.risk_scores).reduce((a, b) => a + b, 0);
  const avgRisk = Math.round((totalRisk / 6) * 10);

  return (
    <div className="space-y-5">
      {/* Decision Header */}
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ring-inset",
            style.bg,
            style.text,
            style.ring
          )}
        >
          <DecisionIcon className="h-4 w-4" />
          {triage.decision}
        </div>
        <div className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {triage.recommended_path.replace("_", " ")}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${((100 - avgRisk) / 100) * 125.66} 125.66`}
                strokeLinecap="round"
                className={avgRisk <= 30 ? "text-emerald-500" : avgRisk <= 60 ? "text-amber-500" : "text-red-500"}
              />
            </svg>
            <span className={cn("absolute text-sm font-bold", avgRisk <= 30 ? "text-emerald-600" : avgRisk <= 60 ? "text-amber-600" : "text-red-600")}>
              {100 - avgRisk}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>

      {/* Rationale */}
      <blockquote className="border-l-2 pl-4 text-sm italic text-muted-foreground">
        {triage.rationale}
      </blockquote>

      {/* Risk Scores */}
      <div>
        <h4 className="mb-3 text-sm font-medium">Risk Assessment</h4>
        <div className="space-y-2">
          {Object.entries(triage.risk_scores).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{riskLabels[key] || key}</span>
                <span className="font-medium">{value}/10</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className={cn("h-1.5 rounded-full transition-all", riskBarColor(value))}
                  style={{ width: `${value * 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disqualifiers */}
      {triage.disqualifiers.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Disqualifiers</h4>
          <div className="space-y-2">
            {triage.disqualifiers.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md p-3",
                  d.severity === "hard"
                    ? "bg-red-500/10 border border-red-500/20"
                    : "bg-amber-500/10 border border-amber-500/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-bold uppercase",
                      d.severity === "hard" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {d.severity}
                  </span>
                  <span className="text-sm font-medium">{d.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Actions */}
      {triage.next_actions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Next Actions</h4>
            {onCreateTask && (
              <span className="text-xs text-muted-foreground">Click to create task</span>
            )}
          </div>
          <div className="space-y-1.5">
            {triage.next_actions.map((action, i) => {
              const created = createdIdxs.has(i);
              const creating = creatingIdx === i;

              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2.5 transition-colors",
                    onCreateTask && !created && "cursor-pointer hover:border-primary/50 hover:bg-muted/50",
                    created && "border-emerald-500/30 bg-emerald-500/5"
                  )}
                  onClick={async () => {
                    if (!onCreateTask || creating || created) return;
                    setCreatingIdx(i);
                    try {
                      await onCreateTask(action);
                      setCreatedIdxs((prev) => new Set(prev).add(i));
                    } finally {
                      setCreatingIdx(null);
                    }
                  }}
                >
                  {created ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : creating ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <span>Step {action.pipeline_step}</span>
                    <span>{action.due_in_days}d</span>
                    {onCreateTask && !created && !creating && (
                      <Plus className="h-3.5 w-3.5 text-muted-foreground/50" />
                    )}
                    {created && (
                      <span className="text-emerald-600 dark:text-emerald-400">Added</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assumptions */}
      {triage.assumptions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Assumptions</h4>
          <div className="space-y-1.5">
            {triage.assumptions.map((a, i) => (
              <div key={i} className="rounded-md bg-muted/50 p-2.5">
                <p className="text-sm">{a.assumption}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Impact: {a.impact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {(sources && sources.length > 0) || triage.sources_summary.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Sources</h4>
          <div className="space-y-1">
            {sources?.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="h-3 w-3" />
                {s.title || s.url}
              </a>
            ))}
            {triage.sources_summary
              .filter((url) => !sources?.some((s) => s.url === url))
              .map((url, i) => (
                <a
                  key={`sum-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  {url}
                </a>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
