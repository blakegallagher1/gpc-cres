"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Workflow,
  Plus,
  Play,
  Edit,
  Trash2,
  Search,
  Filter,
  ChevronRight,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Workflow as WorkflowType } from "@/types";
import { useWorkflows } from "@/lib/hooks/useWorkflows";
import { GuidedOnboardingPanel } from "@/components/onboarding/GuidedOnboardingPanel";

// Workflow templates
const workflowTemplates = [
  {
    id: "template_001",
    name: "Site Acquisition",
    description: "Standard site acquisition analysis workflow",
  },
  {
    id: "template_002",
    name: "Due Diligence",
    description: "Comprehensive due diligence workflow",
  },
  {
    id: "template_003",
    name: "Investment Memo",
    description: "Generate investment committee memo",
  },
];

export default function WorkflowsPage() {
  const { workflows, mutate: mutateWorkflows } = useWorkflows();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowType | null>(null);
  const [creatingWorkflowId, setCreatingWorkflowId] = useState<string | null>(null);

  const filteredWorkflows = workflows.filter(
    (wf) =>
      wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wf.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      toast.error("Workflow name is required");
      return;
    }

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWorkflowName,
          description: newWorkflowDescription,
          nodes: [],
          edges: [],
          config: {},
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create workflow");
      }

      await mutateWorkflows();
      setNewWorkflowName("");
      setNewWorkflowDescription("");
      setCreateDialogOpen(false);
      toast.success("Workflow created");
    } catch {
      toast.error("Failed to create workflow");
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!workflowToDelete) return;

    try {
      const response = await fetch(`/api/workflows/${workflowToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workflow");
      }

      await mutateWorkflows();
      setDeleteDialogOpen(false);
      setWorkflowToDelete(null);
      toast.success("Workflow deleted");
    } catch {
      toast.error("Failed to delete workflow");
    }
  };

  const seedSampleWorkflow = async (template: (typeof workflowTemplates)[number]) => {
    const workflowSeedId = `seed-${template.id}`;
    setCreatingWorkflowId(workflowSeedId);
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${template.name} (sample)`,
          description: template.description,
          nodes: [],
          edges: [],
          config: {},
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create workflow");
      }

      await mutateWorkflows();
      toast.success(`Created "${template.name}" sample workflow`);
    } catch {
      toast.error("Failed to create sample workflow");
    } finally {
      setCreatingWorkflowId(null);
    }
  };

  const handleRunWorkflow = async (workflowId: string) => {
    try {
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

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Workflows</h1>
            <p className="text-muted-foreground">
              {workflows.length} multi-agent workflows
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" />
                  Templates
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Workflow Templates</DialogTitle>
                  <DialogDescription>
                    Choose a template to get started quickly.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                  {workflowTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setNewWorkflowName(template.name);
                        setNewWorkflowDescription(template.description);
                        setTemplateDialogOpen(false);
                        setCreateDialogOpen(true);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-muted"
                    >
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {template.description}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Workflow
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Workflow</DialogTitle>
                  <DialogDescription>
                    Create a new multi-agent workflow.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      placeholder="Workflow name"
                      value={newWorkflowName}
                      onChange={(e) => setNewWorkflowName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what this workflow does..."
                      value={newWorkflowDescription}
                      onChange={(e) => setNewWorkflowDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateWorkflow}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Workflow List */}
        <div className="space-y-4">
          {filteredWorkflows.map((workflow) => (
            <Card key={workflow.id} className="transition-all hover:border-primary/50">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                    <Workflow className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{workflow.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {workflow.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{workflow.run_count} runs</Badge>
                      <Badge variant="outline">
                        {workflow.nodes?.length || 0} nodes
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunWorkflow(workflow.id)}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Run
                  </Button>
                  <Link href={`/workflows/${workflow.id}`}>
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setWorkflowToDelete(workflow);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {workflows.length === 0 ? (
          <GuidedOnboardingPanel
            icon={<Workflow className="h-4 w-4" />}
            title="No workflows configured"
            description="Start with one workflow to automate repetitive steps across deals."
            steps={[
              {
                title: "Create your first workflow",
                description:
                  "Use the builder to design the sequence you run today for every eligible deal.",
              },
              {
                title: "Run against one deal first",
                description:
                  "Validate routing, approvals, and output quality before broader rollout.",
              },
              {
                title: "Assign owners and monitor runs",
                description:
                  "Keep a clean audit trail for each step and handoff in the workflow path.",
              },
            ]}
            primaryActions={[
              {
                label: "Create workflow",
                icon: <Plus className="h-3.5 w-3.5" />,
                onClick: () => setCreateDialogOpen(true),
              },
            ]}
            sampleActions={workflowTemplates.map((template) => ({
              name: template.name,
              description: template.description,
              actionLabel:
                creatingWorkflowId === `seed-${template.id}`
                  ? "Creating..."
                  : "Load sample",
              action: {
                label:
                  creatingWorkflowId === `seed-${template.id}`
                    ? "Creating..."
                    : "Load sample",
                icon: <Workflow className="h-3.5 w-3.5" />,
                disabled: creatingWorkflowId === `seed-${template.id}`,
                onClick: () => seedSampleWorkflow(template),
              },
            }))}
          />
        ) : filteredWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Workflow className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No workflows found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or create a new workflow.
            </p>
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </div>
        ) : null}

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Workflow</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{workflowToDelete?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteWorkflow}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
