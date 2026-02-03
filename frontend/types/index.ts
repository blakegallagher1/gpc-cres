export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  system_prompt?: string;
  tools: AgentTool[];
  handoffs: string[];
  config: Record<string, unknown>;
  status: "active" | "idle" | "error";
  run_count: number;
  color?: string;
  created_at: string;
  updated_at: string;
}

export type RunStatus = "success" | "running" | "error" | "pending" | "cancelled";

export interface Run {
  id: string;
  agent_id: string;
  agent?: Agent;
  status: RunStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  tokens_used?: number;
  cost?: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface Trace {
  id: string;
  run_id: string;
  parent_id?: string;
  type: "llm" | "tool" | "handoff" | "custom";
  name: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  started_at: string;
  duration_ms?: number;
  tokens_input?: number;
  tokens_output?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  config: Record<string, unknown>;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalRuns24h: number;
  totalRunsChange: number;
  activeAgents: number;
  totalAgents: number;
  avgLatency: number;
  avgLatencyChange: number;
  tokenUsage24h: number;
  tokenUsageChange: number;
  estimatedCost: number;
}
