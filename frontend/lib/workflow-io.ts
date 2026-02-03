import { Workflow, WorkflowNode, WorkflowEdge } from "@/types";
import { toast } from "sonner";

export interface ExportedWorkflow {
  version: string;
  exported_at: string;
  workflow: {
    name: string;
    description: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
}

export function exportWorkflow(workflow: Workflow): string {
  const exportData: ExportedWorkflow = {
    version: "1.0.0",
    exported_at: new Date().toISOString(),
    workflow: {
      name: workflow.name,
      description: workflow.description || "",
      nodes: workflow.nodes,
      edges: workflow.edges,
    },
  };

  return JSON.stringify(exportData, null, 2);
}

export function downloadWorkflow(workflow: Workflow): void {
  const json = exportWorkflow(workflow);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = `${workflow.name.toLowerCase().replace(/\s+/g, "-")}-workflow.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
  toast.success("Workflow exported successfully");
}

export interface ImportResult {
  success: boolean;
  workflow?: {
    name: string;
    description: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  error?: string;
}

export function importWorkflow(jsonString: string): ImportResult {
  try {
    const data = JSON.parse(jsonString) as ExportedWorkflow;

    // Validate structure
    if (!data.workflow) {
      return { success: false, error: "Invalid workflow file: missing workflow data" };
    }

    if (!Array.isArray(data.workflow.nodes)) {
      return { success: false, error: "Invalid workflow file: nodes must be an array" };
    }

    if (!Array.isArray(data.workflow.edges)) {
      return { success: false, error: "Invalid workflow file: edges must be an array" };
    }

    // Validate nodes
    for (const node of data.workflow.nodes) {
      if (!node.id || !node.type || !node.position) {
        return { success: false, error: "Invalid node structure" };
      }
    }

    // Validate edges
    for (const edge of data.workflow.edges) {
      if (!edge.id || !edge.source || !edge.target) {
        return { success: false, error: "Invalid edge structure" };
      }
    }

    toast.success("Workflow imported successfully");
    
    return {
      success: true,
      workflow: {
        name: data.workflow.name,
        description: data.workflow.description,
        nodes: data.workflow.nodes,
        edges: data.workflow.edges,
      },
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to parse workflow file: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

export function readWorkflowFile(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(importWorkflow(content));
    };
    
    reader.onerror = () => {
      resolve({ success: false, error: "Failed to read file" });
    };
    
    reader.readAsText(file);
  });
}

// Workflow templates
export const workflowTemplates = [
  {
    id: "blank",
    name: "Blank Workflow",
    description: "Start from scratch",
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 250, y: 50 },
        data: { label: "Start" },
      },
    ],
    edges: [],
  },
  {
    id: "property-analysis",
    name: "Property Analysis Pipeline",
    description: "Analyze a property with research, finance, and legal review",
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 400, y: 50 },
        data: { label: "Start" },
      },
      {
        id: "research",
        type: "agent",
        position: { x: 250, y: 150 },
        data: { agentId: "research", label: "Market Research" },
      },
      {
        id: "finance",
        type: "agent",
        position: { x: 400, y: 250 },
        data: { agentId: "finance", label: "Financial Analysis" },
      },
      {
        id: "legal",
        type: "agent",
        position: { x: 550, y: 250 },
        data: { agentId: "legal", label: "Legal Review" },
      },
      {
        id: "end",
        type: "end",
        position: { x: 400, y: 400 },
        data: { label: "End" },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "research" },
      { id: "e2", source: "research", target: "finance" },
      { id: "e3", source: "research", target: "legal" },
      { id: "e4", source: "finance", target: "end" },
      { id: "e5", source: "legal", target: "end" },
    ],
  },
  {
    id: "development-review",
    name: "Development Review",
    description: "Complete review with design, ops, and risk assessment",
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 400, y: 50 },
        data: { label: "Start" },
      },
      {
        id: "design",
        type: "agent",
        position: { x: 250, y: 150 },
        data: { agentId: "design", label: "Design Advisor" },
      },
      {
        id: "ops",
        type: "agent",
        position: { x: 550, y: 150 },
        data: { agentId: "ops", label: "Operations" },
      },
      {
        id: "risk",
        type: "agent",
        position: { x: 400, y: 250 },
        data: { agentId: "risk", label: "Risk Manager" },
      },
      {
        id: "end",
        type: "end",
        position: { x: 400, y: 400 },
        data: { label: "End" },
      },
    ],
    edges: [
      { id: "e1", source: "start", target: "design" },
      { id: "e2", source: "start", target: "ops" },
      { id: "e3", source: "design", target: "risk" },
      { id: "e4", source: "ops", target: "risk" },
      { id: "e5", source: "risk", target: "end" },
    ],
  },
];
