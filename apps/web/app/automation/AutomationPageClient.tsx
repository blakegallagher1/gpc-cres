"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { workflowTemplates } from "@/lib/workflow-io";
import { formatDuration, timeAgo } from "@/lib/utils";
import { timeAgo as formatTimeAgo } from "@/lib/utils";
import { UserPreferencesPanel } from "@/components/preferences/UserPreferencesPanel";
import { CreateTriggerWizard } from "@/components/proactive/CreateTriggerWizard";
import { ProactiveActionsFeed } from "@/components/proactive/ProactiveActionsFeed";
import { ToolHealthDashboard } from "@/components/self-healing/ToolHealthDashboard";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const RUN_TYPE_OPTIONS = [
  "TRIAGE",
  "BUYER_LIST_BUILD",
  "SOURCE_INGEST",
  "CHANGE_DETECT",
  "OPPORTUNITY_SCAN",
  "BUYER_OUTREACH_DRAFT",
  "DEADLINE_MONITOR",
];
type AutomationTab =
  | "feed"
  | "builder"
  | "health"
  | "preferences"
  | "proactive"
  | "resilience"
  | "failures";

function isAutomationTab(value: string): value is AutomationTab {
  return (
    value === "feed" ||
    value === "builder" ||
    value === "health" ||
    value === "preferences" ||
    value === "proactive" ||
    value === "resilience" ||
    value === "failures"
  );
}

interface BuilderWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  runType: string;
  runMessage: string;
  executionTemplateKey: "QUICK_SCREEN" | "ACQUISITION_PATH" | null;
  source: "template" | "custom";
  persisted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OperatorWorkflowDefinition {
  id: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  runType: string;
  runMessage: string;
  executionTemplateKey: "QUICK_SCREEN" | "ACQUISITION_PATH" | null;
  source: "template" | "custom";
  createdAt: string;
  updatedAt: string;
}

interface WorkflowExecution {
  id: string;
  templateKey: string;
  status: string;
  stepsTotal: number;
  stepsCompleted: number;
  durationMs: number | null;
  startedAt: string;
  output: Record<string, unknown>;
}

interface WorkflowRuntime {
  executions: WorkflowExecution[];
  loading: boolean;
}

interface WorkflowStats {
  total: number;
  succeeded: number;
  failed: number;
}

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
    executionTemplateKey: null,
    source: "template",
    persisted: false,
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
    executionTemplateKey: null,
    source: "custom",
    persisted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function formatRunTypeLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function buildWorkflowStats(executions: WorkflowExecution[]): WorkflowStats {
  const succeeded = executions.filter((execution) => execution.status === "completed").length;
  const failed = executions.filter((execution) => execution.status === "failed").length;
  return {
    total: executions.length,
    succeeded,
    failed,
  };
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
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

function fromPersistedWorkflow(workflow: OperatorWorkflowDefinition): BuilderWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? "",
    nodes: workflow.nodes,
    edges: workflow.edges,
    runType: workflow.runType,
    runMessage: workflow.runMessage,
    executionTemplateKey: workflow.executionTemplateKey,
    source: workflow.source,
    persisted: true,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

function toWorkflowPayload(workflow: BuilderWorkflow) {
  return {
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes,
    edges: workflow.edges,
    runType: workflow.runType,
    runMessage: workflow.runMessage,
    executionTemplateKey: workflow.executionTemplateKey,
    source: workflow.source === "template" ? "custom" : workflow.source,
  };
}

function AutomationPageContent() {
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

  const {
    data: workflowData,
    isLoading: workflowsLoading,
    mutate: mutateSavedWorkflows,
  } = useSWR<{ workflows: OperatorWorkflowDefinition[] }>(
    "/api/automation/workflows",
    fetcher,
    { revalidateOnFocus: false },
  );

  const {
    data: executionData,
    isLoading: executionsLoading,
    mutate: mutateWorkflowExecutions,
  } = useSWR<{ executions: WorkflowExecution[] }>(
    "/api/automation/workflow-executions?limit=25",
    fetcher,
    { refreshInterval: 10000 },
  );

  const [workflowDraft, setWorkflowDraft] = useState<BuilderWorkflow | null>(null);
  const [workflowDealId, setWorkflowDealId] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const templateWorkflows = useMemo(
    () => workflowTemplates.map((template) => makeTemplateWorkflow(template)),
    []
  );

  const persistedWorkflows = useMemo(
    () => (workflowData?.workflows ?? []).map(fromPersistedWorkflow),
    [workflowData]
  );

  const unsavedDraft = workflowDraft && !workflowDraft.persisted
    ? [workflowDraft]
    : [];

  const workflows = useMemo(
    () => [...unsavedDraft, ...persistedWorkflows, ...templateWorkflows],
    [persistedWorkflows, templateWorkflows, unsavedDraft]
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

  const workflowRuntime = useMemo<WorkflowRuntime>(
    () => ({ executions: executionData?.executions ?? [], loading: executionsLoading }),
    [executionData, executionsLoading]
  );

  const { total: runtimeTotal, succeeded: runtimeSucceeded, failed: runtimeFailed } =
    useMemo(() => buildWorkflowStats(workflowRuntime.executions), [workflowRuntime.executions]);

  const persistWorkflowDraft = useCallback(
    async (workflow: BuilderWorkflow): Promise<BuilderWorkflow> => {
      const endpoint = workflow.persisted
        ? `/api/automation/workflows/${workflow.id}`
        : "/api/automation/workflows";
      const response = await fetch(endpoint, {
        method: workflow.persisted ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toWorkflowPayload(workflow)),
      });
      const body = await response.json().catch(() => null) as {
        workflow?: OperatorWorkflowDefinition;
        error?: unknown;
      } | null;
      if (!response.ok || !body?.workflow) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to save workflow");
      }
      const saved = fromPersistedWorkflow(body.workflow);
      setWorkflowDraft(saved);
      setQueryParam(saved.id);
      await mutateSavedWorkflows();
      return saved;
    },
    [mutateSavedWorkflows, setQueryParam]
  );

  const saveWorkflow = useCallback(async () => {
    if (!workflowDraft) return;

    try {
      await persistWorkflowDraft(workflowDraft);
      toast.success("Workflow saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save workflow");
    }
  }, [persistWorkflowDraft, workflowDraft]);

  const createBlankWorkflow = useCallback(() => {
    const draft = {
      ...makeCustomWorkflow("New workflow"),
      id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    };
    setQueryParam(draft.id);
    setWorkflowDraft(draft);
  }, [setQueryParam]);

  const cloneTemplate = useCallback(
    (template: BuilderWorkflow) => {
      const draft = {
        ...template,
        id: `draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "custom" as const,
        persisted: false,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      };
      setQueryParam(draft.id);
      setWorkflowDraft(draft);
      toast.success("Template ready to save.");
    },
    [setQueryParam]
  );

  const runWorkflow = useCallback(async () => {
    if (!workflowDraft || isRunning) return;

    setIsRunning(true);
    try {
      const persistedWorkflow = workflowDraft.persisted
        ? workflowDraft
        : await persistWorkflowDraft(workflowDraft);
      const response = await fetch(`/api/automation/workflows/${persistedWorkflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: workflowDealId.trim().length > 0 ? workflowDealId.trim() : null,
        }),
      });
      const body = await response.json().catch(() => null) as {
        execution?: WorkflowExecution;
        error?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to start workflow run");
      }

      toast.success(`Workflow execution recorded: ${persistedWorkflow.name}`);
      await mutateWorkflowExecutions();
      await mutateSavedWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start workflow run");
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, mutateSavedWorkflows, mutateWorkflowExecutions, persistWorkflowDraft, workflowDealId, workflowDraft]);

  const handleTabChange = useCallback<(value: string) => void>(
    (value) => {
      if (!isAutomationTab(value)) return;
      const selectedTab = value as AutomationTab;
      const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      params.set("tab", selectedTab);
      if (selectedTab !== "builder") {
        params.delete("workflow");
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams]
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
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="proactive">Proactive</TabsTrigger>
          <TabsTrigger value="resilience">Resilience</TabsTrigger>
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
                  {workflowsLoading && (
                    <div className="flex items-center gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading saved workflows...
                    </div>
                  )}
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
                      <label className="text-xs">Execution template</label>
                      <Select
                        value={workflowDraft.executionTemplateKey ?? "GENERIC"}
                        onValueChange={(value) =>
                          setWorkflowDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  executionTemplateKey:
                                    value === "GENERIC"
                                      ? null
                                      : value as "QUICK_SCREEN" | "ACQUISITION_PATH",
                                }
                              : previous
                          )
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GENERIC">Generic operator workflow</SelectItem>
                          <SelectItem value="QUICK_SCREEN">Quick screen</SelectItem>
                          <SelectItem value="ACQUISITION_PATH">Acquisition path</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs">Deal ID for deal workflow runs</label>
                      <Input
                        value={workflowDealId}
                        placeholder="Optional UUID"
                        onChange={(event) => setWorkflowDealId(event.target.value)}
                      />
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
                      Runs are persisted to workflow execution history. Deal templates execute the server workflow when a deal ID is provided.
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
                  Latest persisted workflow executions
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
                ) : workflowRuntime.executions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No workflow executions recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Execution</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflowRuntime.executions.map((execution) => (
                        <TableRow key={execution.id}>
                          <TableCell className="font-mono text-xs">{execution.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusIcon status={execution.status} />
                              {execution.status}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {execution.durationMs ? formatDuration(execution.durationMs) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{execution.templateKey}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTimeAgo(execution.startedAt)}
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

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Learned Preferences</CardTitle>
              <CardDescription className="text-xs">
                Preferences are extracted from conversation patterns and used as
                context for future responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserPreferencesPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proactive" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
            <CreateTriggerWizard />
            <ProactiveActionsFeed />
          </div>
        </TabsContent>

        <TabsContent value="resilience" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Resilient Tool Health</CardTitle>
              <CardDescription className="text-xs">
                Tracks primary success rates, fallback usage, and degraded
                execution signals for resilient tools.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToolHealthDashboard />
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

/**
 * Client controller for the interactive `/automation` route.
 */
export function AutomationPageClient() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading automation dashboard...
          </div>
        </DashboardShell>
      }
    >
      <AutomationPageContent />
    </Suspense>
  );
}
