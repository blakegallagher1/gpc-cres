import type { ChatStreamEvent } from "./streamEventTypes";

export type { ChatStreamEvent } from "./streamEventTypes";
export type ChatStreamEventKind = ChatStreamEvent["type"];

export type ChatMessageEventKind =
  | "assistant"
  | "tool"
  | "agent_progress"
  | "agent_switch"
  | "handoff"
  | "tool_approval"
  | "tool_start"
  | "tool_end"
  | "agent_summary"
  | "error"
  | "system"
  | "tool_result";


export type ChatToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

export type ChatTrustSnapshot = {
  lastAgentName?: string;
  confidence?: number;
  toolsInvoked?: string[];
  packVersionsUsed?: string[];
  missingEvidence?: string[];
  verificationSteps?: string[];
  proofChecks?: string[];
  evidenceCitations?: Array<Record<string, unknown>>;
  durationMs?: number;
  errorSummary?: string | null;
  toolFailures?: string[];
  runId?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  agentName?: string;
  eventKind?: ChatMessageEventKind;
  toolCalls?: ChatToolCall[];
  trust?: ChatTrustSnapshot;
  triageResult?: {
    decision: "ADVANCE" | "HOLD" | "KILL";
    score: number;
    categories?: { name: string; score: number; maxScore: number }[];
    disqualifiers?: string[];
  };
  artifacts?: {
    name: string;
    fileType: string;
    version?: string;
    downloadUrl: string;
  }[];
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  dealId: string | null;
  updatedAt: string;
  messageCount: number;
};

export type ConversationFilter = {
  query: string;
  onlyWithDeals: boolean | null;
};
