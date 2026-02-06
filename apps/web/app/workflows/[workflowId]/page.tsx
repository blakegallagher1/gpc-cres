"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Play,
  Save,
  Undo,
  Redo,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import useSWR from "swr";
import { useAgents } from "@/lib/hooks/useAgents";
import { Workflow } from "@/types";

// Custom node types
import { AgentNode } from "@/components/workflows/nodes/AgentNode";
import { StartNode } from "@/components/workflows/nodes/StartNode";
import { EndNode } from "@/components/workflows/nodes/EndNode";

const nodeTypes: NodeTypes = {
  agent: AgentNode as unknown as ComponentType<NodeProps>,
  start: StartNode as unknown as ComponentType<NodeProps>,
  end: EndNode as unknown as ComponentType<NodeProps>,
};

const defaultNodes: Node[] = [
  {
    id: "start",
    type: "start",
    position: { x: 250, y: 50 },
    data: { label: "Start" },
  },
  {
    id: "end",
    type: "end",
    position: { x: 250, y: 300 },
    data: { label: "End" },
  },
];

const defaultEdges: Edge[] = [{ id: "e1", source: "start", target: "end" }];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function WorkflowEditorPage() {
  const params = useParams<{ workflowId: string }>();
  const workflowId = params?.workflowId ?? "";
  const isNew = workflowId === "new";
  const router = useRouter();
  const { agents } = useAgents();

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeConfigOpen, setNodeConfigOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState(
    isNew ? "New Workflow" : "Site Acquisition Analysis"
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const skipChangeRef = useRef(true);

  const { data, error, isLoading } = useSWR<{ workflow: Workflow }>(
    isNew ? null : `/api/workflows/${workflowId}`,
    fetcher
  );

  useEffect(() => {
    if (data?.workflow) {
      skipChangeRef.current = true;
      setWorkflowName(data.workflow.name);
      setNodes(data.workflow.nodes as Node[]);
      setEdges(data.workflow.edges as Edge[]);
      setHasChanges(false);
    }
  }, [data, setEdges, setNodes]);

  useEffect(() => {
    if (skipChangeRef.current) {
      skipChangeRef.current = false;
      return;
    }
    setHasChanges(true);
  }, [nodes, edges]);

  const agentPalette = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    color: agent.color ?? "#1F2937",
  }));

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setNodeConfigOpen(true);
  }, []);

  const addAgentNode = (agentId: string) => {
    const agent = agentPalette.find((a) => a.id === agentId);
    if (!agent) return;

    const newNode: Node = {
      id: `${agentId}_${Date.now()}`,
      type: "agent",
      position: { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 },
      data: { agentId, label: agent.name },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  const deleteSelectedNode = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) =>
        eds.filter(
          (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
        )
      );
      setNodeConfigOpen(false);
      setSelectedNode(null);
    }
  };

  const validateWorkflow = (): string[] => {
    const errors: string[] = [];

    // Check for start node
    const hasStart = nodes.some((n) => n.type === "start");
    if (!hasStart) errors.push("Workflow must have a Start node");

    // Check for end node
    const hasEnd = nodes.some((n) => n.type === "end");
    if (!hasEnd) errors.push("Workflow must have an End node");

    // Check for disconnected nodes
    const connectedNodeIds = new Set<string>();
    edges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    nodes.forEach((n) => {
      if (n.type !== "start" && n.type !== "end" && !connectedNodeIds.has(n.id)) {
        errors.push(`Node "${n.data.label}" is disconnected`);
      }
    });

    // Check for cycles (simplified)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          if (hasCycle(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    nodes.forEach((n) => {
      if (!visited.has(n.id)) {
        if (hasCycle(n.id)) {
          errors.push("Workflow contains a cycle");
        }
      }
    });

    return errors;
  };

  const handleSave = async () => {
    const errors = validateWorkflow();
    setValidationErrors(errors);

    if (errors.length > 0) {
      toast.error("Workflow has validation errors");
      return;
    }

    try {
      if (isNew) {
        const response = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName, nodes, edges }),
        });
        if (!response.ok) throw new Error("Failed to create workflow");
        const payload = (await response.json()) as { workflow: Workflow };
        toast.success("Workflow created successfully");
        router.replace(`/workflows/${payload.workflow.id}`);
      } else {
        const response = await fetch(`/api/workflows/${workflowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: workflowName, nodes, edges }),
        });
        if (!response.ok) throw new Error("Failed to update workflow");
        setHasChanges(false);
        toast.success("Workflow saved successfully");
      }
    } catch {
      toast.error("Failed to save workflow");
    }
  };

  const handleRun = async () => {
    const errors = validateWorkflow();
    if (errors.length > 0) {
      toast.error("Fix validation errors before running");
      return;
    }

    try {
      if (isNew) {
        toast.error("Save the workflow before running");
        return;
      }
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to start workflow");
      toast.success("Workflow execution started");
    } catch {
      toast.error("Failed to start workflow");
    }
  };

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading workflow...
        </div>
      </DashboardShell>
    );
  }

  if (error && !isNew) {
    return (
      <DashboardShell>
        <div className="space-y-3 py-10 text-center">
          <h1 className="text-2xl font-semibold">Workflow not found</h1>
          <p className="text-muted-foreground">
            We could not locate workflow <span className="font-mono">{workflowId}</span>.
          </p>
          <Button asChild variant="outline">
            <Link href="/workflows">Back to Workflows</Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="flex h-[calc(100vh-8rem)] flex-col">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/workflows">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <Input
                value={workflowName}
                onChange={(e) => {
                  setWorkflowName(e.target.value);
                  setHasChanges(true);
                }}
                className="h-8 border-0 bg-transparent text-xl font-bold focus-visible:ring-0"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {hasChanges && <Badge variant="outline">Unsaved changes</Badge>}
                {validationErrors.length > 0 && (
                  <Badge variant="destructive">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    {validationErrors.length} errors
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            <Button size="sm" onClick={handleRun}>
              <Play className="mr-2 h-4 w-4" />
              Run
            </Button>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              Validation Errors
            </div>
            <ul className="mt-1 list-inside list-disc text-sm text-destructive">
              {validationErrors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Workflow Canvas */}
        <div className="flex flex-1 gap-4">
          {/* Agent Palette */}
          <div className="w-64 shrink-0 rounded-lg border bg-card p-4">
            <h3 className="mb-3 font-semibold">Agent Palette</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Click to add agents to the workflow
            </p>
            <div className="space-y-2">
              {agentPalette.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => addAgentNode(agent.id)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  <div
                    className="h-8 w-8 rounded-lg"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="text-sm font-medium">{agent.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 rounded-lg border">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
            >
              <Background />
              <Controls />
              <MiniMap />
              <Panel position="top-right" className="m-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" title="Undo">
                    <Undo className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" title="Redo">
                    <Redo className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </div>

        {/* Node Configuration Dialog */}
        <Dialog open={nodeConfigOpen} onOpenChange={setNodeConfigOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configure Node</DialogTitle>
              <DialogDescription>
                Configure the selected workflow node.
              </DialogDescription>
            </DialogHeader>
            {selectedNode && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Node Type</Label>
                  <p className="text-sm text-muted-foreground capitalize">
                    {selectedNode.type}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={(selectedNode.data as { label?: string }).label ?? ""}
                    onChange={(e) => {
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, label: e.target.value } }
                            : n
                        )
                      );
                    }}
                  />
                </div>
                {selectedNode.type === "agent" && (
                  <div className="space-y-2">
                  <Label>Agent ID</Label>
                  <p className="text-sm text-muted-foreground">
                      {(selectedNode.data as { agentId?: string }).agentId ?? ""}
                  </p>
                </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="destructive" onClick={deleteSelectedNode}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button onClick={() => setNodeConfigOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
