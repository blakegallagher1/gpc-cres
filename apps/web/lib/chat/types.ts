export type ChatStreamEvent =
  | { type: "text_delta"; content: string }
  | {
      type: "tool_call";
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
    }
  | { type: "agent_switch"; agentName: string }
  | {
      type: "agent_progress";
      runId: string;
      status: "running";
      partialOutput: string;
      toolsInvoked?: string[];
      lastAgentName?: string;
      correlationId?: string;
    }
  | {
      type: "agent_summary";
      runId: string;
      trust: {
        lastAgentName?: string;
        confidence?: number;
        toolsInvoked?: string[];
        evidenceCitations?: Array<Record<string, unknown>>;
        missingEvidence?: string[];
        verificationSteps?: string[];
        proofChecks?: string[];
        durationMs?: number;
        packVersionsUsed?: string[];
        errorSummary?: string | null;
        toolFailures?: string[];
      };
    }
  | { type: "error"; message: string }
  | {
      type: "done";
      runId?: string;
      status?: "succeeded" | "failed" | "canceled";
      conversationId?: string | null;
    }
  | { type: "tool_result"; name: string; result?: unknown }
  | { type: "agent_progress_summary"; agentName: string; message: string };

export type ChatMessageEventKind =
  | "assistant"
  | "tool"
  | "agent_progress"
  | "agent_switch"
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
