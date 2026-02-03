"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Play,
  Wrench,
  GitBranch,
  History,
  FileText,
  CheckCircle2,
  Activity,
  ChevronRight,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatNumber, formatCurrency, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { Run } from "@/types";
import { useAgents } from "@/lib/hooks/useAgents";
import { useRuns } from "@/lib/hooks/useRuns";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { class: string; label: string }> = {
    success: { class: "bg-green-500/10 text-green-500", label: "Success" },
    running: { class: "bg-blue-500/10 text-blue-500", label: "Running" },
    error: { class: "bg-red-500/10 text-red-500", label: "Error" },
    pending: { class: "bg-yellow-500/10 text-yellow-500", label: "Pending" },
    idle: { class: "bg-gray-500/10 text-gray-500", label: "Idle" },
  };

  const variant = variants[status] || variants.idle;

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${variant.class}`}>
      {status === "running" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {variant.label}
    </span>
  );
}

function ToolCard({ tool }: { tool: { name: string; description: string; parameters?: Record<string, unknown> } }) {
  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{tool.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
        {tool.parameters && Object.keys(tool.parameters).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Parameters:</p>
            <code className="mt-1 block rounded bg-muted p-2 text-xs">
              {JSON.stringify(tool.parameters, null, 2)}
            </code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HandoffCard({ agentId }: { agentId: string }) {
  const { agents } = useAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${agent.color}20` }}
        >
          <Bot className="h-5 w-5" style={{ color: agent.color }} />
        </div>
        <div className="flex-1">
          <p className="font-medium">{agent.name}</p>
          <p className="text-sm text-muted-foreground">{agent.model}</p>
        </div>
        <Link href={`/agents/${agent.id}`}>
          <Button variant="ghost" size="sm">
            View
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RunRow({ run }: { run: Run }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <StatusBadge status={run.status} />
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{run.id}</p>
        <p className="text-sm text-muted-foreground">{timeAgo(run.started_at)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm">{formatNumber(run.tokens_used ?? 0)} tokens</p>
        <p className="text-sm text-muted-foreground">{formatCurrency(run.cost ?? 0)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm">
          {run.duration_ms ? `${Math.round(run.duration_ms / 1000)}s` : "—"}
        </p>
      </div>
      <Link href={`/runs/${run.id}`}>
        <Button variant="ghost" size="sm">
          View
        </Button>
      </Link>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const { agents, isLoading: agentsLoading } = useAgents();
  const { runs: agentRuns } = useRuns({ agentId });
  const agent = agents.find((a) => a.id === agentId);
  
  const [activeTab, setActiveTab] = useState("overview");
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<Run | null>(null);
  const [editedPrompt, setEditedPrompt] = useState(agent?.system_prompt || "");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);

  useEffect(() => {
    if (agent) {
      setEditedPrompt(agent.system_prompt || "");
    }
  }, [agent]);

  if (!agent && agentsLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-20">
          <Bot className="h-16 w-16 animate-pulse text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Loading agent...</h1>
        </div>
      </DashboardShell>
    );
  }

  if (!agent) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-20">
          <Bot className="h-16 w-16 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Agent Not Found</h1>
          <p className="text-muted-foreground">The agent you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/agents" className="mt-4">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const handleRunAgent = async () => {
    if (!runInput.trim()) return;

    setIsRunning(true);
    setRunResult(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { query: runInput } }),
      });

      if (!response.ok) throw new Error("Failed to run agent");

      const data = await response.json();
      setRunResult(data.run);
      toast.success("Agent completed successfully");
    } catch {
      toast.error("Failed to run agent");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSavePrompt = async () => {
    try {
      // In production, save to Supabase
      // await supabase.from('agents').update({ system_prompt: editedPrompt }).eq('id', agentId)
      toast.success("System prompt updated");
      setIsEditingPrompt(false);
    } catch {
      toast.error("Failed to update prompt");
    }
  };

  const connectedAgents = agent.handoffs
    .map((id) => agents.find((a) => a.id === id))
    .filter(Boolean);

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/agents">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${agent.color}20` }}
            >
              <Bot className="h-7 w-7" style={{ color: agent.color }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{agent.model}</span>
                <span>•</span>
                <StatusBadge status={agent.status} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
              <Button onClick={() => setRunDialogOpen(true)}>
                <Play className="mr-2 h-4 w-4" />
                Run Agent
              </Button>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Run {agent.name}</DialogTitle>
                  <DialogDescription>
                    Enter your query or task for the agent to process.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="input">Input</Label>
                    <Textarea
                      id="input"
                      placeholder="Enter your query..."
                      value={runInput}
                      onChange={(e) => setRunInput(e.target.value)}
                      rows={4}
                      disabled={isRunning}
                    />
                  </div>
                  
                  {isRunning && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Activity className="h-4 w-4 animate-spin" />
                      Running agent...
                    </div>
                  )}

                  {runResult && (
                    <div className="rounded-lg border bg-muted p-4">
                      <p className="font-medium">Result:</p>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2 text-xs">
                        {JSON.stringify(runResult.output, null, 2)}
                      </pre>
                      <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                        <span>{formatNumber(runResult.tokens_used ?? 0)} tokens</span>
                        <span>{formatCurrency(runResult.cost ?? 0)}</span>
                        <span>{Math.round((runResult.duration_ms || 0) / 1000)}s</span>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={handleRunAgent}
                    disabled={!runInput.trim() || isRunning}
                  >
                    {isRunning ? "Running..." : "Run Agent"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 lg:w-auto">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
            <TabsTrigger value="handoffs" className="gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">Handoffs</span>
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Runs</span>
            </TabsTrigger>
            <TabsTrigger value="prompt" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Prompt</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Runs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(agent.run_count)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Tools
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{agent.tools.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Handoffs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{agent.handoffs.length}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{agent.description}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {agentRuns.slice(0, 3).map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
                {agentRuns.length > 3 && (
                  <Button
                    variant="ghost"
                    className="mt-4 w-full"
                    onClick={() => setActiveTab("runs")}
                  >
                    View all runs
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {agent.tools.map((tool, index) => (
                <ToolCard key={index} tool={tool} />
              ))}
            </div>
            {agent.tools.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Wrench className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No tools</h3>
                <p className="text-muted-foreground">This agent has no tools configured.</p>
              </div>
            )}
          </TabsContent>

          {/* Handoffs Tab */}
          <TabsContent value="handoffs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Connected Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  This agent can hand off tasks to the following agents:
                </p>
                <div className="space-y-2">
                  {connectedAgents.map((connectedAgent) => (
                    connectedAgent && (
                      <HandoffCard key={connectedAgent.id} agentId={connectedAgent.id} />
                    )
                  ))}
                </div>
                {connectedAgents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <GitBranch className="h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No handoffs</h3>
                    <p className="text-muted-foreground">This agent has no handoff connections.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Runs Tab */}
          <TabsContent value="runs" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Run History</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">All</Badge>
                  <Badge variant="outline">Success</Badge>
                  <Badge variant="outline">Error</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {agentRuns.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
                {agentRuns.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <History className="h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No runs yet</h3>
                    <p className="text-muted-foreground">This agent hasn&apos;t been run yet.</p>
                    <Button className="mt-4" onClick={() => setRunDialogOpen(true)}>
                      <Play className="mr-2 h-4 w-4" />
                      Run Agent
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prompt Tab */}
          <TabsContent value="prompt" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>System Prompt</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                >
                  {isEditingPrompt ? "Cancel" : "Edit"}
                </Button>
              </CardHeader>
              <CardContent>
                {isEditingPrompt ? (
                  <div className="space-y-4">
                    <Textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      rows={20}
                      className="font-mono text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditedPrompt(agent.system_prompt ?? "");
                          setIsEditingPrompt(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleSavePrompt}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] rounded-md border bg-muted p-4">
                    <pre className="font-mono text-sm whitespace-pre-wrap">{agent.system_prompt}</pre>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
