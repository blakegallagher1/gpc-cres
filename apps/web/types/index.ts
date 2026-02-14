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

export interface EvidenceCitation {
  tool?: string;
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
  url?: string;
  isOfficial?: boolean;
}

export interface AgentTrustEnvelope {
  toolsInvoked: string[];
  packVersionsUsed: string[];
  evidenceCitations: EvidenceCitation[];
  evidenceHash?: string | null;
  confidence: number;
  missingEvidence: string[];
  verificationSteps: string[];
  toolFailures?: string[];
  proofChecks?: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  fallbackLineage?: string[];
  fallbackReason?: string;
  plan?: string[];
  lastAgentName?: string;
  errorSummary?: string | null;
  durationMs?: number;
}

export interface RunOutputJson extends Partial<AgentTrustEnvelope> {
  durationMs?: number;
  errorSummary?: string | null;
  runState?: Record<string, unknown>;
}

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
  outputJson?: RunOutputJson | null;
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

export type WorkflowRunStatus = "running" | "succeeded" | "failed" | "canceled";

export interface WorkflowRun {
  id: string;
  orgId: string;
  runType: string;
  status: WorkflowRunStatus | string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  error?: string | null;
  openaiResponseId?: string | null;
  inputHash?: string | null;
  outputJson?: Record<string, unknown> | null;
  summary?: {
    lastAgentName?: string;
    confidence?: number | null;
    evidenceCount?: number;
    missingEvidenceCount?: number;
    toolCount?: number;
  } | null;
}

export interface WorkflowTrace {
  id: string;
  runId: string;
  parentId?: string | null;
  type: "llm" | "tool" | "handoff" | "custom";
  name: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  startedAt: string;
  durationMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  cost?: number | null;
  metadata?: Record<string, unknown> | null;
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

export interface Project {
  id: string;
  name: string;
  address?: string | null;
  status?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  assigned_agent?: string | null;
  assignee_user_id?: string | null;
  due_date?: string | null;
  sla_hours?: number | null;
  blocked_by_task_id?: string | null;
  swimlane?: string | null;
  agent_generated?: boolean | null;
  source_event_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DealRoom {
  id: string;
  project_id: string;
  name: string;
  status?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface DealRoomMessage {
  id: string;
  room_id: string;
  sender_type: "user" | "agent" | "system";
  sender_id?: string | null;
  content_md: string;
  attachments?: Record<string, unknown> | null;
  created_at: string;
}

export interface DealRoomEvent {
  id: string;
  room_id: string;
  event_type:
    | "agent_update"
    | "artifact_update"
    | "task_created"
    | "scenario_run"
    | "export_ready"
    | "ingestion_complete"
    | "system";
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface DealRoomArtifact {
  id: string;
  room_id: string;
  type: "memo" | "proforma" | "schedule" | "checklist" | "other";
  title: string;
  current_version_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface DealRoomArtifactVersion {
  id: string;
  artifact_id: string;
  content_md?: string | null;
  content_json?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  source_run_id?: string | null;
}

export interface Citation {
  id: string;
  project_id: string;
  run_id?: string | null;
  source_type: "web" | "file" | "db";
  title?: string | null;
  url?: string | null;
  snippet?: string | null;
  accessed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ClaimLink {
  id: string;
  run_id?: string | null;
  artifact_version_id?: string | null;
  claim_text: string;
  citation_ids: string[];
  confidence?: number | null;
  created_at: string;
}

export interface Scenario {
  id: string;
  project_id: string;
  base_assumptions?: Record<string, unknown> | null;
  created_at: string;
}

export interface ScenarioRun {
  id: string;
  scenario_id: string;
  delta_assumptions?: Record<string, unknown> | null;
  results?: Record<string, unknown> | null;
  created_at: string;
}

export interface ExportJob {
  id: string;
  project_id: string;
  room_id?: string | null;
  type: "memo" | "ic_deck" | "underwriting_packet" | "dd_report";
  status: "queued" | "running" | "failed" | "complete";
  payload?: Record<string, unknown> | null;
  output_files?: Record<string, unknown> | null;
  errors?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface IngestionJob {
  id: string;
  project_id: string;
  document_id: string;
  status: "queued" | "running" | "failed" | "complete";
  extracted_data?: Record<string, unknown> | null;
  errors?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ToneProfile {
  id: string;
  name: string;
  description?: string | null;
  system_prefix?: string | null;
  style_guidelines?: Record<string, unknown> | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  default_tone_profile_id?: string | null;
  notification_prefs?: Record<string, unknown> | null;
  created_at: string;
}
