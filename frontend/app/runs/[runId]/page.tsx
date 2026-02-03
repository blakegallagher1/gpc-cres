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
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatNumber, formatCurrency, formatDuration, formatDate } from "@/lib/utils";
import { Trace } from "@/types";
import { useRun } from "@/lib/hooks/useRun";
import { useRunTraces } from "@/lib/hooks/useRunTraces";
import { useAgents } from "@/lib/hooks/useAgents";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { icon: React.ElementType; class: string; label: string }> = {
    success: { icon: CheckCircle2, class: "bg-green-500/10 text-green-500", label: "Success" },
    running: { icon: Loader2, class: "bg-blue-500/10 text-blue-500", label: "Running" },
    error: { icon: XCircle, class: "bg-red-500/10 text-red-500", label: "Error" },
    pending: { icon: Clock, class: "bg-yellow-500/10 text-yellow-500", label: "Pending" },
  };

  const variant = variants[status] || variants.pending;
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
  trace: Trace;
  traces: Trace[];
  level?: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (trace: Trace) => void;
}) {
  const children = traces.filter((t) => t.parent_id === trace.id);
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
          {formatDuration(trace.duration_ms || 0)}
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
  trace: Trace;
  totalDuration: number;
  startOffset: number;
}) {
  const left = (startOffset / totalDuration) * 100;
  const width = ((trace.duration_ms || 0) / totalDuration) * 100;

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

export default function RunTracePage() {
  const params = useParams();
  const runId = params.runId as string;

  const { run, isLoading: isRunLoading, isError: isRunError } = useRun(runId);
  const { traces, isLoading: isTracesLoading } = useRunTraces(runId);
  const { agents, isLoading: isAgentsLoading } = useAgents();
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [activeTab, setActiveTab] = useState("tree");

  useEffect(() => {
    if (selectedTrace && !traces.find((trace) => trace.id === selectedTrace.id)) {
      setSelectedTrace(null);
    }
  }, [selectedTrace, traces]);

  const agent = run ? agents.find((a) => a.id === run.agent_id) : undefined;

  const toggleTrace = (id: string) => {
    const newExpanded = new Set(expandedTraces);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTraces(newExpanded);
  };

  const rootTraces = traces.filter((t) => !t.parent_id);

  // Calculate timeline
  const runStart = run ? new Date(run.started_at).getTime() : 0;
  const totalDuration = run?.duration_ms || 1;

  if (isRunLoading || isTracesLoading || isAgentsLoading) {
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
                {agent?.name} • {formatDate(run.started_at)}
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
                {formatDuration(run.duration_ms || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tokens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(run.tokens_used ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(run.cost ?? 0)}</div>
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
                        <p>{formatDuration(selectedTrace.duration_ms || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Tokens</p>
                        <p>
                          {formatNumber(selectedTrace.tokens_input ?? 0)} in /{" "}
                          {formatNumber(selectedTrace.tokens_output ?? 0)} out
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
                      const traceStart = new Date(trace.started_at).getTime();
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
                            {formatDuration(trace.duration_ms || 0)}
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
                  {JSON.stringify(run.input, null, 2)}
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
                  {JSON.stringify(run.output, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
