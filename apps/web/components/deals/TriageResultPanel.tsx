"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, ChevronRight, Loader2, Check, Bot, ChevronDown } from "lucide-react";

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

type ActionState = "idle" | "creating" | "running" | "done" | "error";

interface ActionResult {
  state: ActionState;
  agentName?: string;
  output?: string;
  expanded?: boolean;
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
  /** Called to create the task. Should return the new task ID. */
  onRunAction?: (action: NextAction) => Promise<string>;
  /** Called when agent finishes a task so parent can update state. */
  onTaskCompleted?: (taskId: string, agentOutput: string) => void;
  dealId?: string;
}

export function TriageResultPanel({ triage, sources, onRunAction, onTaskCompleted, dealId }: TriageResultPanelProps) {
  const style = decisionStyles[triage.decision];
  const DecisionIcon = style.icon;
  const [actionResults, setActionResults] = useState<Record<number, ActionResult>>({});
  const runningRef = useRef<Set<number>>(new Set());

  /** Run a single next action by index — creates task then streams agent. */
  const executeAction = async (i: number) => {
    const action = triage.next_actions[i];
    if (!onRunAction || !dealId || !action) return;
    if (runningRef.current.has(i)) return;
    const currentResult = actionResults[i];
    if (currentResult?.state === "done" || currentResult?.state === "running" || currentResult?.state === "creating") return;

    runningRef.current.add(i);

    // Step 1: Create task
    setActionResults((prev) => ({ ...prev, [i]: { state: "creating" } }));
    let taskId: string;
    try {
      taskId = await onRunAction(action);
    } catch {
      setActionResults((prev) => ({ ...prev, [i]: { state: "error", output: "Failed to create task" } }));
      runningRef.current.delete(i);
      return;
    }

    // Step 2: Stream agent execution
    setActionResults((prev) => ({ ...prev, [i]: { state: "running", agentName: "Coordinator", output: "" } }));

    try {
      const res = await fetch(`/api/deals/${dealId}/tasks/${taskId}/run`, { method: "POST" });
      if (!res.ok || !res.body) {
        setActionResults((prev) => ({ ...prev, [i]: { state: "error", output: "Agent request failed" } }));
        runningRef.current.delete(i);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullOutput = "";
      let currentAgent = "Coordinator";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "agent_switch") {
              currentAgent = event.agentName;
              setActionResults((prev) => ({ ...prev, [i]: { ...prev[i], agentName: currentAgent } }));
            } else if (event.type === "text_delta") {
              fullOutput += event.content;
              setActionResults((prev) => ({ ...prev, [i]: { ...prev[i], output: fullOutput } }));
            } else if (event.type === "done") {
              setActionResults((prev) => ({
                ...prev,
                [i]: { state: "done", agentName: currentAgent, output: fullOutput, expanded: false },
              }));
              onTaskCompleted?.(taskId, fullOutput);
            } else if (event.type === "error") {
              setActionResults((prev) => ({ ...prev, [i]: { state: "error", output: event.message } }));
            }
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch (err) {
      setActionResults((prev) => ({
        ...prev,
        [i]: { state: "error", output: err instanceof Error ? err.message : "Stream failed" },
      }));
    } finally {
      runningRef.current.delete(i);
    }
  };

  const handleRunAll = () => {
    triage.next_actions.forEach((_, i) => {
      const r = actionResults[i];
      if (!r || (r.state !== "done" && r.state !== "running" && r.state !== "creating")) {
        executeAction(i);
      }
    });
  };

  const allDone = triage.next_actions.length > 0 &&
    triage.next_actions.every((_, i) => actionResults[i]?.state === "done");
  const anyRunning = triage.next_actions.some((_, i) => {
    const s = actionResults[i]?.state;
    return s === "running" || s === "creating";
  });

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
            {onRunAction && dealId && (
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  allDone
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : anyRunning
                      ? "bg-blue-500/10 text-blue-500 cursor-not-allowed"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
                disabled={anyRunning || allDone}
                onClick={handleRunAll}
              >
                {allDone ? (
                  <><Check className="h-3 w-3" /> All Done</>
                ) : anyRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Running...</>
                ) : (
                  <><Bot className="h-3 w-3" /> Run All</>
                )}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {triage.next_actions.map((action, i) => {
              const result = actionResults[i] || { state: "idle" as ActionState };
              const isActive = result.state === "creating" || result.state === "running";
              const isDone = result.state === "done";
              const isError = result.state === "error";

              return (
                <div key={i} className="space-y-0">
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-2.5 transition-colors",
                      onRunAction && !isDone && !isActive && "cursor-pointer hover:border-primary/50 hover:bg-muted/50",
                      isDone && "border-emerald-500/30 bg-emerald-500/5",
                      isActive && "border-blue-500/30 bg-blue-500/5",
                      isError && "border-red-500/30 bg-red-500/5"
                    )}
                    onClick={() => executeAction(i)}
                  >
                    {isDone ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : isActive ? (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                    ) : isError ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{action.title}</p>
                      {!isActive && !isDone && (
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      )}
                      {isActive && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          <Bot className="mr-1 inline h-3 w-3" />
                          {result.state === "creating" ? "Creating task..." : `${result.agentName} researching...`}
                        </p>
                      )}
                      {isDone && (
                        <button
                          className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionResults((prev) => ({
                              ...prev,
                              [i]: { ...prev[i], expanded: !prev[i]?.expanded },
                            }));
                          }}
                        >
                          <Bot className="h-3 w-3" />
                          Completed by {result.agentName}
                          <ChevronDown className={cn("h-3 w-3 transition-transform", result.expanded && "rotate-180")} />
                        </button>
                      )}
                      {isError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{result.output}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>Step {action.pipeline_step}</span>
                      <span>{action.due_in_days}d</span>
                    </div>
                  </div>

                  {/* Agent output (streaming or final) */}
                  {(isActive || (isDone && result.expanded)) && result.output && (
                    <div className="ml-5 rounded-b-md border border-t-0 bg-muted/30 p-3">
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                        {result.output}
                        {isActive && <span className="animate-pulse">|</span>}
                      </pre>
                    </div>
                  )}
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
