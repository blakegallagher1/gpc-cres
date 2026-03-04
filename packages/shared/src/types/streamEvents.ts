/**
 * Unified Streaming Event Contract
 *
 * Single source of truth for agent streaming events used by both:
 * - SSE path (apps/web/lib/agent/executeAgent.ts → /api/chat)
 * - WebSocket path (infra/cloudflare-agent/src/durable-object.ts → agents.gallagherpropco.com)
 *
 * All event producers and consumers should import from this module.
 */

// ---------------------------------------------------------------------------
// Core event types (emitted by both SSE and WS)
// ---------------------------------------------------------------------------

export type TextDeltaEvent = {
  type: "text_delta";
  content: string;
};

export type ToolStartEvent = {
  type: "tool_start";
  name: string;
  args?: Record<string, unknown>;
  toolCallId?: string;
};

export type ToolEndEvent = {
  type: "tool_end";
  name: string;
  result?: unknown;
  status?: "completed" | "failed";
  toolCallId?: string;
};

export type AgentSwitchEvent = {
  type: "agent_switch";
  agentName: string;
};

export type DoneEvent = {
  type: "done";
  runId?: string;
  status?: "succeeded" | "failed" | "canceled";
  conversationId?: string | null;
};

export type ErrorEvent = {
  type: "error";
  message: string;
  code?: string;
  correlationId?: string;
};

// ---------------------------------------------------------------------------
// Operation events (long-running async tasks, batch screening)
// ---------------------------------------------------------------------------

export type OperationProgressEvent = {
  type: "operation_progress";
  operationId: string;
  label: string;
  pct: number;
};

export type OperationDoneEvent = {
  type: "operation_done";
  operationId: string;
  label: string;
  summary: string;
};

export type OperationErrorEvent = {
  type: "operation_error";
  operationId: string;
  label: string;
  error: string;
};

// ---------------------------------------------------------------------------
// Extended events (SSE-only in current implementation, may expand to WS)
// ---------------------------------------------------------------------------

export type ToolApprovalRequestedEvent = {
  type: "tool_approval_requested";
  name: string;
  args?: Record<string, unknown>;
  toolCallId?: string | null;
  runId?: string;
};

export type HandoffEvent = {
  type: "handoff";
  from?: string;
  to: string;
  fromAgent?: string;
  toAgent?: string;
};

export type AgentProgressEvent = {
  type: "agent_progress";
  runId: string;
  status: "running";
  partialOutput: string;
  toolsInvoked?: string[];
  lastAgentName?: string;
  correlationId?: string;
};

export type AgentSummaryEvent = {
  type: "agent_summary";
  runId: string;
  trust: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Events guaranteed to stream over both SSE and WS. */
export type UniversalStreamEvent =
  | TextDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | AgentSwitchEvent
  | DoneEvent
  | ErrorEvent
  | OperationProgressEvent
  | OperationDoneEvent
  | OperationErrorEvent;

/** All possible stream events (SSE may emit extended events). */
export type AgentStreamEvent =
  | UniversalStreamEvent
  | ToolApprovalRequestedEvent
  | HandoffEvent
  | AgentProgressEvent
  | AgentSummaryEvent;

/** Event type discriminator strings. */
export type AgentStreamEventType = AgentStreamEvent["type"];

/** Set of event types that stream over both transports. */
export const UNIVERSAL_EVENT_TYPES = new Set<AgentStreamEventType>([
  "text_delta",
  "tool_start",
  "tool_end",
  "agent_switch",
  "done",
  "error",
  "operation_progress",
  "operation_done",
  "operation_error",
]);

/** Runtime check: is this event type universal (both SSE and WS)? */
export function isUniversalEvent(type: string): boolean {
  return UNIVERSAL_EVENT_TYPES.has(type as AgentStreamEventType);
}
