"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronRight,
  ChevronDown,
  Bot,
  Wrench,
  GitBranch,
  FileText,
  Terminal,
  FileSearch,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AgentStatePanel } from "@/components/agent-state/AgentStatePanel";
import { formatNumber, formatCurrency, formatDuration, formatDate } from "@/lib/utils";
import { WorkflowTrace, RunOutputJson } from "@/types";
import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";
import { useRun } from "@/lib/hooks/useRun";
import { useRunTraces } from "@/lib/hooks/useRunTraces";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { icon: React.ElementType; class: string; label: string }> = {
    succeeded: { icon: CheckCircle2, class: "bg-green-500/10 text-green-500", label: "Succeeded" },
    running: { icon: Loader2, class: "bg-blue-500/10 text-blue-500", label: "Running" },
    failed: { icon: XCircle, class: "bg-red-500/10 text-red-500", label: "Failed" },
    canceled: { icon: Clock, class: "bg-yellow-500/10 text-yellow-500", label: "Canceled" },
  };

  const variant = variants[status] || variants.running;
  const Icon = variant.icon;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${variant.class}`}>
      <Icon className={`h-4 w-4 ${status === "running" ? "animate-spin" : ""}`} />
      {variant.label}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ElementType> = {
    llm: Bot,
    tool: Wrench,
    handoff: GitBranch,
    custom: FileText,
  };
  const Icon = icons[type] || FileText;
  return <Icon className="h-4 w-4" />;
}

function TraceTreeItem({
  trace,
  traces,
  level = 0,
  expanded,
  onToggle,
  onSelect,
}: {
  trace: WorkflowTrace;
  traces: WorkflowTrace[];
  level?: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (trace: WorkflowTrace) => void;
}) {
  const children = traces.filter((t) => t.parentId === trace.id);
  const isExpanded = expanded.has(trace.id);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-muted"
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => {
          onSelect(trace);
          if (hasChildren) {
            onToggle(trace.id);
          }
        }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        ) : (
          <span className="w-4" />
        )}
        <TypeIcon type={trace.type} />
        <span className="font-medium">{trace.name}</span>
        <span className="ml-auto text-sm text-muted-foreground">
          {formatDuration(trace.durationMs || 0)}
        </span>
      </div>
      {isExpanded &&
        children.map((child) => (
          <TraceTreeItem
            key={child.id}
            trace={child}
            traces={traces}
            level={level + 1}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function TimelineBar({
  trace,
  totalDuration,
  startOffset,
}: {
  trace: WorkflowTrace;
  totalDuration: number;
  startOffset: number;
}) {
  const left = (startOffset / totalDuration) * 100;
  const width = ((trace.durationMs || 0) / totalDuration) * 100;

  const colors: Record<string, string> = {
    llm: "bg-blue-500",
    tool: "bg-green-500",
    handoff: "bg-purple-500",
    custom: "bg-gray-500",
  };

  return (
    <div
      className="absolute h-6 rounded"
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
      }}
    >
      <div className={`h-full rounded ${colors[trace.type]} opacity-80`} />
    </div>
  );
}

type AuditEvent = {
  id: string;
  label: string;
  detail: string;
  type: "evidence" | "proof" | "tool-failure" | "fallback" | "retry-policy";
};

function sourceLabel(sourceId?: string, url?: string) {
  if (typeof sourceId === "string" && sourceId.trim()) {
    return sourceId;
  }
  if (typeof url === "string" && url.trim()) {
    return url;
  }
  return "Unknown source";
}

function getRetryCountFromMetadata(metadata?: Record<string, unknown>): number {
  if (!metadata) return 0;

  const parseNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === "string" && !Number.isNaN(Number(value))) {
      return Math.max(0, Math.floor(Number(value)));
    }
    return null;
  };

  const candidates: Array<[string, number | null]> = [
    ["retryCount", parseNumber(metadata["retryCount"])],
    ["retry_count", parseNumber(metadata["retry_count"])],
    ["retryAttempts", parseNumber(metadata["retryAttempts"])],
    ["retry_attempts", parseNumber(metadata["retry_attempts"])],
    ["retries", parseNumber(metadata["retries"])],
  ];

  for (const [, value] of candidates) {
    if (value !== null) {
      return value;
    }
  }

  if (metadata["retried"] === true || metadata["retry"] === true) {
    return 1;
  }

  return 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(Math.max(0, value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(Math.max(0, parsed)) : undefined;
  }
  return undefined;
}

export default function RunTracePage() {
  const params = useParams<{ runId: string }>();
  const runId = params?.runId ?? "";

  const { run, isLoading: isRunLoading, isError: isRunError } = useRun(runId);
  const { traces, isLoading: isTracesLoading } = useRunTraces(runId);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [selectedTrace, setSelectedTrace] = useState<WorkflowTrace | null>(null);
  const [activeTab, setActiveTab] = useState("tree");

  useEffect(() => {
    if (selectedTrace && !traces.find((trace) => trace.id === selectedTrace.id)) {
      setSelectedTrace(null);
    }
  }, [selectedTrace, traces]);

  const toggleTrace = (id: string) => {
    const newExpanded = new Set(expandedTraces);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTraces(newExpanded);
  };

  const rootTraces = traces.filter((t) => !t.parentId);
  const failureTraces = traces.filter((trace) => {
    const metadata = trace.metadata;
    if (!metadata) return false;
    return (
      metadata.status === "error" ||
      metadata.failed === true ||
      typeof metadata.error === "string" ||
      typeof metadata.message === "string"
    );
  });
  const toolFailureDetails = failureTraces.map((trace) => {
    const metadata = trace.metadata;
    const detail =
      typeof metadata?.error === "string"
        ? metadata.error
        : typeof metadata?.message === "string"
        ? metadata.message
        : undefined;
    return `${trace.name}${detail ? ` — ${detail}` : ""}`;
  });
  const retryCount = traces.reduce(
    (acc, trace) => acc + getRetryCountFromMetadata(trace.metadata ?? undefined),
    0,
  );

  // Calculate timeline
  const runStart = run ? new Date(run.startedAt).getTime() : 0;
  const totalDuration = run?.durationMs || 1;

  if (isRunLoading || isTracesLoading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading run details...
        </div>
      </DashboardShell>
    );
  }

  if (isRunError || !run) {
    return (
      <DashboardShell>
        <div className="space-y-3 py-10 text-center">
          <h1 className="text-2xl font-semibold">Run not found</h1>
          <p className="text-muted-foreground">
            We could not locate run <span className="font-mono">{runId}</span>.
          </p>
          <Button asChild variant="outline">
            <Link href="/runs">Back to Runs</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  const outputJson = (run.outputJson ?? null) as RunOutputJson | null;
  const persistedOutput = outputJson ? (outputJson as Record<string, unknown>) : null;
  const runState = outputJson?.runState;
  const persistedRunState =
    runState && typeof runState === "object" && !Array.isArray(runState)
      ? (runState as Record<string, unknown>)
      : null;
  const proofChecks = toStringArray(outputJson?.proofChecks).length
    ? toStringArray(outputJson?.proofChecks)
    : toStringArray(persistedRunState?.[AGENT_RUN_STATE_KEYS.proofChecks]);
  const retryAttempts =
    toNumber(outputJson?.retryAttempts) ??
    toNumber(persistedRunState?.[AGENT_RUN_STATE_KEYS.retryAttempts]);
  const retryMaxAttempts =
    toNumber(outputJson?.retryMaxAttempts) ??
    toNumber(persistedRunState?.[AGENT_RUN_STATE_KEYS.retryMaxAttempts]);
  const retryMode =
    typeof outputJson?.retryMode === "string"
      ? outputJson.retryMode
      : typeof persistedOutput?.[AGENT_RUN_STATE_KEYS.retryMode] === "string"
        ? String(persistedOutput[AGENT_RUN_STATE_KEYS.retryMode])
        : undefined;
  const fallbackLineage = toStringArray(
    outputJson?.fallbackLineage ??
      persistedRunState?.[AGENT_RUN_STATE_KEYS.fallbackLineage],
  ).length
    ? toStringArray(
        outputJson?.fallbackLineage ??
          persistedRunState?.[AGENT_RUN_STATE_KEYS.fallbackLineage],
      )
    : toStringArray(persistedRunState?.[AGENT_RUN_STATE_KEYS.fallbackLineage]);
  const fallbackReason =
    typeof outputJson?.fallbackReason === "string"
      ? outputJson.fallbackReason
      : typeof persistedRunState?.[AGENT_RUN_STATE_KEYS.fallbackReason] === "string"
        ? String(persistedRunState[AGENT_RUN_STATE_KEYS.fallbackReason])
        : undefined;
  const evidenceCitations = Array.isArray(outputJson?.evidenceCitations)
    ? outputJson.evidenceCitations
    : [];
  const evidenceCitationEvents: AuditEvent[] = evidenceCitations.map((citation, index) => ({
    id: `evidence-${citation.snapshotId ?? citation.sourceId ?? index}`,
    label: `Evidence captured (${sourceLabel(citation.sourceId, citation.url)})`,
    detail: `${citation.tool ?? "tool-unknown"}${citation.contentHash ? ` • hash ${citation.contentHash.slice(0, 8)}…` : ""}`,
    type: "evidence",
  }));
  const proofEvents: AuditEvent[] = proofChecks.map((check, index) => ({
    id: `proof-${index}`,
    label: "Proof check",
    detail: `Passed: ${check}`,
    type: "proof",
  }));
  const toolFailureEvents: AuditEvent[] = toolFailureDetails.map((detail, index) => ({
    id: `tool-failure-${index}`,
    label: "Tool failure",
    detail,
    type: "tool-failure",
  }));
  const fallbackEvent: AuditEvent | null = fallbackReason
    ? {
        id: "fallback",
        label: "Fallback",
        detail: fallbackReason,
        type: "fallback",
      }
    : null;
  const retryPolicyEvent: AuditEvent | null = outputJson?.evidenceRetryPolicy
    ? {
        id: "retry-policy",
        label: "Retry policy",
        detail: `${outputJson.evidenceRetryPolicy.enabled ? "enabled" : "disabled"}: ${outputJson.evidenceRetryPolicy.reason}`,
        type: "retry-policy",
      }
    : null;
  const auditEvents = [
    ...evidenceCitationEvents,
    ...proofEvents,
    ...toolFailureEvents,
    ...(fallbackEvent ? [fallbackEvent] : []),
    ...(retryPolicyEvent ? [retryPolicyEvent] : []),
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/runs">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold font-mono">{runId}</h1>
                <StatusBadge status={run.status} />
              </div>
              <p className="text-muted-foreground">
                {run.runType} • {formatDate(run.startedAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDuration(run.durationMs || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(outputJson?.evidenceCitations?.length ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typeof outputJson?.confidence === "number"
                  ? `${Math.round(outputJson.confidence * 100)}%`
                  : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{traces.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agent state & evidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentStatePanel
              lastAgentName={outputJson?.lastAgentName ?? run.summary?.lastAgentName ?? "Coordinator"}
              plan={outputJson?.plan}
              confidence={outputJson?.confidence}
              missingEvidence={outputJson?.missingEvidence}
              verificationSteps={outputJson?.verificationSteps}
              evidenceCitations={outputJson?.evidenceCitations}
              toolsInvoked={outputJson?.toolsInvoked}
              packVersionsUsed={outputJson?.packVersionsUsed}
              errorSummary={outputJson?.errorSummary ?? null}
              toolFailureDetails={toolFailureDetails}
              proofChecks={proofChecks}
              retryAttempts={retryAttempts}
              retryMaxAttempts={retryMaxAttempts}
              retryMode={typeof retryMode === "string" ? retryMode : undefined}
              fallbackLineage={fallbackLineage}
              fallbackReason={fallbackReason}
              retryCount={retryCount}
            />
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="tree" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Trace Tree
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-2">
              <Clock className="h-4 w-4" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="input" className="gap-2">
              <Terminal className="h-4 w-4" />
              Input
            </TabsTrigger>
            <TabsTrigger value="output" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Output
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileSearch className="h-4 w-4" />
              Audit
            </TabsTrigger>
          </TabsList>

          {/* Trace Tree */}
          <TabsContent value="tree" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Execution Trace</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1">
                      {rootTraces.map((trace) => (
                        <TraceTreeItem
                          key={trace.id}
                          trace={trace}
                          traces={traces}
                          expanded={expandedTraces}
                          onToggle={toggleTrace}
                          onSelect={setSelectedTrace}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Trace Detail */}
              <Card>
                <CardHeader>
                  <CardTitle>Step Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedTrace ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium">{selectedTrace.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Type</p>
                        <Badge variant="outline">{selectedTrace.type}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Duration</p>
                        <p>{formatDuration(selectedTrace.durationMs || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Tokens</p>
                        <p>
                          {formatNumber(selectedTrace.tokensInput ?? 0)} in /{" "}
                          {formatNumber(selectedTrace.tokensOutput ?? 0)} out
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Cost</p>
                        <p>{formatCurrency(selectedTrace.cost ?? 0)}</p>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-sm text-muted-foreground">Input</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(selectedTrace.input, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Output</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(selectedTrace.output, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Select a trace step to view details</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>Execution Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Time markers */}
                  <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                    <span>0ms</span>
                    <span>{formatDuration(totalDuration / 4)}</span>
                    <span>{formatDuration(totalDuration / 2)}</span>
                    <span>{formatDuration((totalDuration * 3) / 4)}</span>
                    <span>{formatDuration(totalDuration)}</span>
                  </div>

                  {/* Timeline bars */}
                  <div className="relative h-64 space-y-2">
                    {traces.map((trace) => {
                      const traceStart = new Date(trace.startedAt).getTime();
                      const startOffset = traceStart - runStart;
                      return (
                        <div
                          key={trace.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                          onClick={() => setSelectedTrace(trace)}
                        >
                          <div className="w-32 shrink-0 truncate text-sm">{trace.name}</div>
                          <div className="relative flex-1">
                            <TimelineBar
                              trace={trace}
                              totalDuration={totalDuration}
                              startOffset={startOffset}
                            />
                          </div>
                          <div className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                            {formatDuration(trace.durationMs || 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-4 flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded bg-blue-500" />
                      <span>LLM Call</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded bg-green-500" />
                      <span>Tool</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded bg-purple-500" />
                      <span>Handoff</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Input */}
          <TabsContent value="input">
            <Card>
              <CardHeader>
                <CardTitle>Run Input</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-lg bg-muted p-4 font-mono text-sm">
                  {JSON.stringify(
                    {
                      runId: run.id,
                      runType: run.runType,
                      inputHash: run.inputHash ?? null,
                      dealId: run.dealId ?? null,
                      jurisdictionId: run.jurisdictionId ?? null,
                      sku: run.sku ?? null,
                      startedAt: run.startedAt,
                    },
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Output */}
          <TabsContent value="output">
            <Card>
              <CardHeader>
                <CardTitle>Run Output</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-lg bg-muted p-4 font-mono text-sm">
                  {JSON.stringify(run.outputJson ?? null, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Evidence audit trail</CardTitle>
                </CardHeader>
                <CardContent>
                  {evidenceCitations.length > 0 ? (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead>Source URL</TableHead>
                            <TableHead>Snapshot</TableHead>
                            <TableHead>Tool</TableHead>
                            <TableHead>Hash</TableHead>
                            <TableHead>Official</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {evidenceCitations.map((citation, index) => (
                            <TableRow key={citation.snapshotId ?? citation.sourceId ?? index}>
                              <TableCell>
                                {citation.sourceId ? (
                                  <Link
                                    href={`/reference?tab=evidence&sourceId=${citation.sourceId}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {citation.sourceId}
                                  </Link>
                                ) : (
                                  sourceLabel(undefined, citation.url)
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {citation.snapshotId ?? "—"}
                              </TableCell>
                              <TableCell>{citation.tool ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {citation.contentHash ?? "—"}
                              </TableCell>
                              <TableCell>
                                {citation.isOfficial ? (
                                  <Badge variant="default">Official</Badge>
                                ) : (
                                  <span className="text-muted-foreground">No</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {citation.url ? (
                                  <a
                                    href={citation.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    open
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No evidence citations were captured.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Audit timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {auditEvents.length > 0 ? (
                    <ol className="space-y-2">
                      {auditEvents.map((event) => {
                        const dot = event.type === "evidence"
                          ? "bg-blue-500"
                          : event.type === "proof"
                            ? "bg-emerald-500"
                            : event.type === "tool-failure"
                            ? "bg-red-500"
                            : event.type === "fallback"
                            ? "bg-amber-500"
                            : "bg-purple-500";

                        return (
                          <li key={event.id} className="flex gap-2">
                            <span className={`mt-2 h-2.5 w-2.5 rounded-full ${dot}`} />
                            <div>
                              <p className="text-sm font-medium">{event.label}</p>
                              <p className="text-xs text-muted-foreground">{event.detail}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">No audit timeline events were recorded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
