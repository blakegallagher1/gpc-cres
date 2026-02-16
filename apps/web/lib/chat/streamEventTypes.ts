export type ChatStreamEvent =
  | { type: "text_delta"; content: string }
  | {
      type: "tool_call";
      name: string;
      args: Record<string, unknown>;
      result?: unknown;
    }
  | {
      type: "tool_start";
      name: string;
      args?: Record<string, unknown>;
      toolCallId?: string | null;
    }
  | {
      type: "tool_end";
      name: string;
      result?: unknown;
      status?: "completed" | "failed";
      toolCallId?: string | null;
    }
  | {
      type: "tool_approval_requested";
      name: string;
      args?: Record<string, unknown>;
      toolCallId?: string | null;
      runId?: string;
    }
  | { type: "agent_switch"; agentName: string }
  | {
      type: "handoff";
      from?: string;
      to: string;
      fromAgent?: string;
      toAgent?: string;
    }
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
        retryAttempts?: number;
        retryMaxAttempts?: number;
        retryMode?: string;
        fallbackLineage?: string[];
        fallbackReason?: string;
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

export type ChatStreamEventKind = ChatStreamEvent["type"];
