"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  XCircle,
  ZapIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type TemplateKey = "QUICK_SCREEN" | "ACQUISITION_PATH";

interface WorkflowTemplate {
  key: TemplateKey;
  label: string;
  description: string;
  stepLabels: string[];
}

interface WorkflowStepResult {
  key: string;
  label: string;
  status: "ok" | "skipped" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output: Record<string, unknown>;
  error?: string;
}

interface WorkflowExecution {
  id: string;
  templateKey: TemplateKey;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  currentStepKey: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  output: Record<string, unknown>;
  stepResults: WorkflowStepResult[];
  error: string | null;
  errorStepKey: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface DealWorkflowsPanelProps {
  dealId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function verdictBadgeClass(verdict: unknown): string {
  if (typeof verdict !== "string") return "bg-muted text-muted-foreground";
  switch (verdict) {
    case "ADVANCE":
    case "fit":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
    case "REVIEW":
    case "borderline":
      return "bg-amber-500/10 text-amber-500 border-amber-500/30";
    case "KILL":
    case "miss":
      return "bg-destructive/10 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function DealWorkflowsPanel({ dealId }: DealWorkflowsPanelProps) {
  const {
    data: templateData,
    error: templateError,
  } = useSWR<{ templates: WorkflowTemplate[] }>("/api/workflows/templates", fetcher, {
    revalidateOnFocus: false,
  });

  const { data, isLoading, error, mutate } = useSWR<{ executions: WorkflowExecution[] }>(
    `/api/deals/${dealId}/workflows`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [running, setRunning] = useState<TemplateKey | null>(null);

  const executions = useMemo(() => data?.executions ?? [], [data]);

  const runTemplate = useCallback(
    async (templateKey: TemplateKey) => {
      setRunning(templateKey);
      try {
        const res = await fetch(`/api/deals/${dealId}/workflows`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateKey }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        const finishedVerdict = (payload.execution?.output as Record<string, unknown> | undefined)
          ?.decision ?? (payload.execution?.output as Record<string, unknown> | undefined)?.verdict;
        toast.success(
          `${templateKey} complete${finishedVerdict ? ` — ${String(finishedVerdict)}` : ""}`,
        );
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Workflow failed");
      } finally {
        setRunning(null);
      }
    },
    [dealId, mutate],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm tracking-wide uppercase">
          <span>Workflows</span>
          <Badge variant="outline" className="text-[10px]">
            {executions.length} runs
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {templateError && (
            <p className="text-xs text-destructive">Failed to load templates.</p>
          )}
          {!templateData && !templateError && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading templates…
            </div>
          )}
          {(templateData?.templates ?? []).map((template) => (
            <div
              key={template.key}
              className="flex items-start justify-between gap-3 rounded border border-border bg-card p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ZapIcon className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium">{template.label}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {template.description}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Steps: {template.stepLabels.join(" → ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={running !== null}
                onClick={() => runTemplate(template.key)}
                className="shrink-0"
              >
                {running === template.key ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                <span className="ml-1">Run</span>
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Recent runs
          </p>
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          )}
          {error && !isLoading && (
            <p className="text-xs text-destructive">Failed to load history.</p>
          )}
          {!isLoading && executions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No workflow runs yet. Click a template above to kick off your first screen.
            </p>
          )}
          <div className="space-y-2">
            {executions.map((exec) => {
              const rawVerdict =
                (exec.output as Record<string, unknown>).decision ??
                (exec.output as Record<string, unknown>).verdict;
              const verdict = typeof rawVerdict === "string" ? rawVerdict : null;
              return (
                <div
                  key={exec.id}
                  className="rounded border border-border bg-card p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">
                          {exec.templateKey}
                        </span>
                        {exec.status === "completed" && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                        {exec.status === "failed" && (
                          <XCircle className="h-3 w-3 text-destructive" />
                        )}
                        {(exec.status === "running" || exec.status === "pending") && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {verdict ? (
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${verdictBadgeClass(verdict)}`}
                          >
                            {verdict.toUpperCase()}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(exec.startedAt).toLocaleString()} ·{" "}
                        {formatDuration(exec.durationMs)} · {exec.stepsCompleted}/
                        {exec.stepsTotal} steps
                      </p>
                      {exec.error && (
                        <p className="mt-1 text-[10px] text-destructive">
                          {exec.errorStepKey ? `[${exec.errorStepKey}] ` : ""}
                          {exec.error}
                        </p>
                      )}
                    </div>
                  </div>

                  {exec.stepResults.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                        Step output
                      </summary>
                      <div className="mt-1 space-y-1">
                        {exec.stepResults.map((step) => (
                          <div
                            key={step.key}
                            className="flex items-start gap-1 rounded bg-background p-1 text-[10px]"
                          >
                            {step.status === "ok" && (
                              <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-500" />
                            )}
                            {step.status === "failed" && (
                              <XCircle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-destructive" />
                            )}
                            {step.status === "skipped" && (
                              <ChevronRight className="mt-0.5 h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1">
                              <strong>{step.label}</strong> · {formatDuration(step.durationMs)}
                              {step.error ? (
                                <span className="text-destructive"> — {step.error}</span>
                              ) : null}
                              <pre className="mt-0.5 whitespace-pre-wrap break-all text-[9px] text-muted-foreground">
                                {JSON.stringify(step.output, null, 0).slice(0, 400)}
                              </pre>
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DealWorkflowsPanel;
