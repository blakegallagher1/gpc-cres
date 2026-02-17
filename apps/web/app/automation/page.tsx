"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Loader2,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCcw,
  PlayCircle,
  Save,
  Plus,
  FolderOpen,
  WandSparkles,
  LayoutList,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { MetricCard } from "@/components/portfolio/MetricCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkflowNode, WorkflowEdge } from "@/types";
import { useRuns } from "@/lib/hooks/useRuns";
import { workflowTemplates } from "@/lib/workflow-io";
import type { WorkflowRun } from "@/types";
import { formatDuration, timeAgo } from "@/lib/utils";
import { timeAgo as formatTimeAgo } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RUN_TYPE_OPTIONS = [
  "TRIAGE",
  "BUYER_LIST_BUILD",
  "SOURCE_INGEST",
  "CHANGE_DETECT",
  "OPPORTUNITY_SCAN",
  "BUYER_OUTREACH_DRAFT",
  "DEADLINE_MONITOR",
];
type AutomationTab = "feed" | "builder" | "health" | "failures";

function isAutomationTab(value: string): value is AutomationTab {
  return value === "feed" || value === "builder" || value === "health" || value === "failures";
}

interface BuilderWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  runType: string;
  runMessage: string;
  source: "template" | "custom";
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRuntime {
  runs: WorkflowRun[];
  loading: boolean;
}

interface WorkflowStats {
  total: number;
  succeeded: number;
  failed: number;
}

const STORAGE_KEY = "automation.custom-workflows";

function nowIso() {
  return new Date().toISOString();
}

function makeTemplateWorkflow(template: (typeof workflowTemplates)[number]): BuilderWorkflow {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    nodes: [...template.nodes],
    edges: [...template.edges],
    runType: template.id === "property-analysis" ? "ARTIFACT_GEN" : "TRIAGE",
    runMessage: `Run ${template.name}`,
    source: "template",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makeCustomWorkflow(name: string): BuilderWorkflow {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    description: "",
    runType: "TRIAGE",
    runMessage: `Run ${name}`,
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 100, y: 100 },
        data: { label: "Start" },
      },
    ],
    edges: [],
    source: "custom",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeWorkflowIdList(workflows: BuilderWorkflow[]): BuilderWorkflow[] {
  return workflows.filter((workflow, index, all) =>
    all.findIndex((item) => item.id === workflow.id) === index
  );
}

function formatRunTypeLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function buildWorkflowStats(runs: WorkflowRun[]): WorkflowStats {
  const succeeded = runs.filter((run) => run.status === "succeeded").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  return {
    total: runs.length,
    succeeded,
    failed,
  };
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "succeeded":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function AutomationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawTab = searchParams?.get("tab");
  const tab: AutomationTab = isAutomationTab(rawTab ?? "") ? (rawTab as AutomationTab) : "feed";
  const workflowQueryParam = searchParams?.get("workflow");

  const { data: stats } = useSWR<{
    totalToday: number;
    successRateToday: number;
    avgDurationMs: number | null;
    failuresRequiringAttention: number;
  }>("/api/automation/events?view=stats", fetcher, { refreshInterval: 30000 });

  const { data: feedData, mutate: mutateFeed } = useSWR<{
    events: Array<{
      id: string;
      handlerName: string;
      eventType: string;
      status: string;
      durationMs: number | null;
      startedAt: string;
    }>;
  }>("/api/automation/events?view=feed", fetcher, {
    refreshInterval: 10000,
  });

  const { data: healthData } = useSWR<{ handlers: Array<{
    handlerName: string;
    status: "healthy" | "degraded" | "failing" | "inactive";
    totalRuns7d: number;
    successRate7d: number;
    avgDurationMs: number | null;
    lastRunAt: string | null;
  }> }>(
    "/api/automation/events?view=health",
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: failureData } = useSWR<{
    events: Array<{
      id: string;
      handlerName: string;
      eventType: string;
      status: string;
      error?: string | null;
      startedAt: string;
    }>;
  }>("/api/automation/events?view=failures", fetcher, {
    refreshInterval: 30000,
  });

  const [workflowDraft, setWorkflowDraft] = useState<BuilderWorkflow | null>(null);
  const [customWorkflows, setCustomWorkflows] = useState<BuilderWorkflow[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as Array<BuilderWorkflow>;
      if (!Array.isArray(parsed)) return [];
      return normalizeWorkflowIdList(parsed);
    } catch {
      return [];
    }
  });
  const [isRunning, setIsRunning] = useState(false);

  const templateWorkflows = useMemo(
    () => workflowTemplates.map((template) => makeTemplateWorkflow(template)),
    []
  );

  const workflows = useMemo(
    () => [...templateWorkflows, ...customWorkflows],
    [customWorkflows, templateWorkflows]
  );

  const selectedWorkflow = useMemo(() => {
    if (!workflowQueryParam) return workflows[0] ?? null;
    return workflows.find((workflow) => workflow.id === workflowQueryParam) ?? workflows[0] ?? null;
  }, [workflowQueryParam, workflows]);

  useEffect(() => {
    if (!selectedWorkflow) {
      setWorkflowDraft(null);
      return;
    }

    setWorkflowDraft(selectedWorkflow);
  }, [selectedWorkflow]);

  useEffect(() => {
    if (!workflowDraft) return;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customWorkflows));
  }, [customWorkflows, workflowDraft]);

  const setQueryParam = useCallback(
    (nextWorkflowId: string | null) => {
      const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      if (nextWorkflowId) {
        params.set("workflow", nextWorkflowId);
      } else {
        params.delete("workflow");
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectedRunType = workflowDraft?.runType ?? "TRIAGE";
  const { runs: runtimeRuns, mutate: mutateRuntimeRuns } = useRuns({
    runType: selectedRunType,
    limit: 20,
  });

  const workflowRuntime = useMemo<WorkflowRuntime>(
    () => ({ runs: runtimeRuns ?? [], loading: false }),
    [runtimeRuns]
  );

  const { total: runtimeTotal, succeeded: runtimeSucceeded, failed: runtimeFailed } =
    useMemo(() => buildWorkflowStats(runtimeRuns), [runtimeRuns]);

  const saveWorkflow = useCallback(() => {
    if (!workflowDraft) return;

    if (workflowDraft.source === "template") {
      const asCustom: BuilderWorkflow = {
        ...workflowDraft,
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "custom",
        updatedAt: nowIso(),
        createdAt: nowIso(),
      };
      setCustomWorkflows((previous) => {
        const next = [...previous, asCustom];
        return normalizeWorkflowIdList(next);
      });
      setQueryParam(asCustom.id);
      setWorkflowDraft(asCustom);
      toast.success("Template copied as custom workflow.");
      return;
    }

    setCustomWorkflows((previous) => {
      const next = previous.some((workflow) => workflow.id === workflowDraft.id)
        ? previous.map((workflow) =>
            workflow.id === workflowDraft.id
              ? { ...workflowDraft, updatedAt: nowIso() }
              : workflow,
          )
        : [...previous, workflowDraft];
      return normalizeWorkflowIdList(next);
    });
    toast.success("Workflow saved.");
  }, [setQueryParam, workflowDraft]);

  const createBlankWorkflow = useCallback(() => {
    const draft = makeCustomWorkflow("New workflow");
    setCustomWorkflows((previous) => {
      const next = [...previous, draft];
      return normalizeWorkflowIdList(next);
    });
    setQueryParam(draft.id);
    setWorkflowDraft(draft);
  }, [setQueryParam]);

  const cloneTemplate = useCallback(
    (template: BuilderWorkflow) => {
      const draft = {
        ...template,
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "custom" as const,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      };
      setCustomWorkflows((previous) => {
        const next = [...previous, draft];
        return normalizeWorkflowIdList(next);
      });
      setQueryParam(draft.id);
      setWorkflowDraft(draft);
      toast.success("Template cloned.");
    },
    [setQueryParam]
  );

  const runWorkflow = useCallback(async () => {
    if (!workflowDraft || isRunning) return;

    setIsRunning(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: workflowDraft.runMessage || `Run ${workflowDraft.name}`,
          runType: workflowDraft.runType,
          persistConversation: false,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to start workflow run");
      }

      toast.success(`Run started: ${workflowDraft.name}`);
      await mutateRuntimeRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow run");
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, mutateRuntimeRuns, workflowDraft]);

  const handleTabChange = useCallback<(value: string) => void>(
    (value) => {
      if (!isAutomationTab(value)) return;
      const selectedTab = value as string;

      setQueryParam(selectedTab === "feed" ? null : selectedTab === "feed" ? null : "builder");
      const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      params.set("tab", selectedTab);
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams, setQueryParam]
  );

  const formatDurationMs = useCallback((ms: number | null) => {
    if (ms === null) return "--";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }, []);

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automation Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor automation health and build executable workflow run configs
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutateFeed()}
          className="gap-1"
        >
          <RefreshCcw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Runs Today"
          value={String(stats?.totalToday ?? 0)}
          icon={WandSparkles}
        />
        <MetricCard
          label="Success Rate"
          value={stats ? `${stats.successRateToday}%` : "--"}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Avg Duration"
          value={formatDurationMs(stats?.avgDurationMs ?? null)}
          icon={Clock}
        />
        <MetricCard
          label="Failures"
          value={String(stats?.failuresRequiringAttention ?? 0)}
          icon={AlertTriangle}
        />
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
        <TabsList>
          <TabsTrigger value="feed">Live Feed</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="health">Handler Health</TabsTrigger>
          <TabsTrigger value="failures">
            Failures
            {(failureData?.events?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1 text-[9px]">
                {failureData?.events.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Events</CardTitle>
              <CardDescription className="text-xs">
                Auto-refreshes every 10 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!feedData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : feedData.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No automation events recorded yet. Events will appear as
                  automation handlers execute.
                </p>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-xs"></TableHead>
                        <TableHead className="text-xs">Handler</TableHead>
                        <TableHead className="text-xs">Event</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                        <TableHead className="text-right text-xs">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feedData.events.map((ev) => (
                        <TableRow
                          key={ev.id}
                          className="cursor-pointer"
                        >
                          <TableCell>
                            <StatusIcon status={ev.status} />
                          </TableCell>
                          <TableCell className="text-xs font-medium">{ev.handlerName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ev.eventType}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {ev.durationMs != null ? formatDuration(ev.durationMs) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {timeAgo(ev.startedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="builder" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Workflow list</CardTitle>
                <CardDescription className="text-xs">
                  Includes built-in templates and custom workflows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between gap-2">
                  <Button size="sm" onClick={createBlankWorkflow} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </Button>
                </div>
                <div className="space-y-2">
                  {workflows.map((workflow) => (
                    <button
                      key={workflow.id}
                      type="button"
                      onClick={() => setQueryParam(workflow.id)}
                      className={`w-full rounded-lg border p-3 text-left text-sm ${
                        selectedWorkflow?.id === workflow.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{workflow.name}</p>
                        <Badge variant={workflow.source === "template" ? "outline" : "secondary"}>
                          {workflow.source}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {workflow.description || "No description"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {workflow.nodes.length} node(s), {workflow.edges.length} edge(s) ·{" "}
                        {formatRunTypeLabel(workflow.runType)}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Builder</CardTitle>
                <CardDescription className="text-xs">
                  Edit metadata and run configuration for a selected workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!workflowDraft ? (
                  <p className="text-sm text-muted-foreground">Select a workflow to begin.</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs">Name</label>
                      <Input
                        value={workflowDraft.name}
                        onChange={(event) =>
                          setWorkflowDraft((previous) =>
                            previous
                              ? { ...previous, name: event.target.value }
                              : previous
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs">Description</label>
                      <Input
                        value={workflowDraft.description}
                        onChange={(event) =>
                          setWorkflowDraft((previous) =>
                            previous
                              ? { ...previous, description: event.target.value }
                              : previous
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs">Run type</label>
                      <Select
                        value={workflowDraft.runType}
                        onValueChange={(value) =>
                          setWorkflowDraft((previous) =>
                            previous ? { ...previous, runType: value } : previous
                          )
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RUN_TYPE_OPTIONS.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs">Run message</label>
                      <Textarea
                        value={workflowDraft.runMessage}
                        rows={3}
                        onChange={(event) =>
                          setWorkflowDraft((previous) =>
                            previous
                              ? { ...previous, runMessage: event.target.value }
                              : previous
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={saveWorkflow} className="gap-1">
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </Button>
                      <Button
                        onClick={runWorkflow}
                        variant="secondary"
                        disabled={isRunning}
                        className="gap-1"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {isRunning ? "Starting..." : "Run workflow"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This run sends the message and selected run type to the agent runtime.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Template gallery</CardTitle>
                <CardDescription className="text-xs">
                  Start with a template and clone it into a custom workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {templateWorkflows.map((template) => (
                  <div key={template.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cloneTemplate(template)}
                        className="gap-1"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Clone
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Run activity</CardTitle>
                <CardDescription className="text-xs">
                  Latest runs filtered by selected workflow type
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Total runs" value={String(runtimeTotal)} icon={LayoutList} />
                  <MetricCard label="Succeeded" value={String(runtimeSucceeded)} icon={CheckCircle2} />
                  <MetricCard label="Failed" value={String(runtimeFailed)} icon={XCircle} />
                </div>
                {workflowRuntime.loading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading runs...
                  </div>
                ) : workflowRuntime.runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runs yet for the selected run type.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflowRuntime.runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-mono text-xs">{run.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusIcon status={run.status} />
                              {run.status}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {run.durationMs ? formatDuration(run.durationMs) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{run.runType}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTimeAgo(run.startedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Handler Health (7-Day)</CardTitle>
            </CardHeader>
            <CardContent>
              {!healthData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Handler</TableHead>
                      <TableHead className="text-center text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Total Runs</TableHead>
                      <TableHead className="text-right text-xs">Success Rate</TableHead>
                      <TableHead className="text-right text-xs">Avg Duration</TableHead>
                      <TableHead className="text-right text-xs">Last Run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthData.handlers.map((h) => (
                      <TableRow key={h.handlerName}>
                        <TableCell className="text-xs font-medium">{h.handlerName}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={h.status === "healthy" ? "default" : "destructive"}
                          >
                            {h.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {h.totalRuns7d}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          <span
                            className={
                              h.successRate7d < 60
                                ? "text-red-600 font-semibold"
                                : h.successRate7d < 90
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                            }
                          >
                            {h.successRate7d}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {h.avgDurationMs == null ? "N/A" : formatDuration(h.avgDurationMs)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {h.lastRunAt ? timeAgo(h.lastRunAt) : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Failed Events</CardTitle>
              <CardDescription className="text-xs">
                Recent failures with error details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!failureData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : failureData.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No failures detected. All handlers are running clean.
                </p>
              ) : (
                <div className="space-y-3">
                  {failureData.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-lg border border-red-200 bg-red-50/30 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium">{ev.handlerName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {ev.eventType}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(ev.startedAt)}
                        </span>
                      </div>
                      {ev.error && (
                        <p className="mt-2 rounded bg-red-100/50 p-2 font-mono text-xs text-red-700">
                          {ev.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
