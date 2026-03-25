import { buildMapActionEventsFromToolResult } from "./mapActionEvents";
import type { AgentStreamEvent } from "./executeAgent";

/**
 * Emits a single SSE event frame to the active chat stream.
 */
export type AgentEventEmitter = (event: AgentStreamEvent) => void;
type AgentSummaryTrust = Extract<AgentStreamEvent, { type: "agent_summary" }>["trust"];

/**
 * Emits the current active agent.
 */
export function emitAgentSwitch(emit: AgentEventEmitter, agentName: string): void {
  emit({ type: "agent_switch", agentName });
}

/**
 * Emits a handoff followed by the destination agent switch, preserving the
 * existing SSE contract used by chat consumers.
 */
export function emitHandoff(
  emit: AgentEventEmitter,
  params: { from?: string; to: string },
): void {
  emit({
    type: "handoff",
    from: params.from,
    to: params.to,
    fromAgent: params.from,
    toAgent: params.to,
  });
  emitAgentSwitch(emit, params.to);
}

/**
 * Emits a plain-text delta.
 */
export function emitTextDelta(emit: AgentEventEmitter, content: string): void {
  emit({ type: "text_delta", content });
}

/**
 * Emits a pending tool-approval event.
 */
export function emitToolApprovalRequested(
  emit: AgentEventEmitter,
  params: {
    name: string;
    args?: Record<string, unknown>;
    toolCallId?: string | null;
    runId?: string;
  },
): void {
  emit({
    type: "tool_approval_requested",
    name: params.name,
    args: params.args,
    toolCallId: params.toolCallId,
    runId: params.runId,
  });
}

/**
 * Emits the beginning of a tool invocation.
 */
export function emitToolStart(
  emit: AgentEventEmitter,
  params: {
    name: string;
    args?: Record<string, unknown>;
    toolCallId?: string | null;
  },
): void {
  emit({
    type: "tool_start",
    name: params.name,
    args: params.args,
    toolCallId: params.toolCallId,
  });
}

/**
 * Emits a completed tool invocation.
 */
export function emitToolEnd(
  emit: AgentEventEmitter,
  params: {
    name: string;
    result?: unknown;
    status?: "completed" | "failed";
    toolCallId?: string | null;
  },
): void {
  emit({
    type: "tool_end",
    name: params.name,
    result: params.result,
    status: params.status,
    toolCallId: params.toolCallId,
  });
}

/**
 * Emits a running progress frame.
 */
export function emitAgentProgress(
  emit: AgentEventEmitter,
  params: {
    runId: string;
    status: "running";
    partialOutput: string;
    toolsInvoked?: string[];
    lastAgentName?: string;
    correlationId?: string;
    runState?: Record<string, unknown>;
  },
): void {
  emit({
    type: "agent_progress",
    runId: params.runId,
    status: params.status,
    partialOutput: params.partialOutput,
    toolsInvoked: params.toolsInvoked,
    lastAgentName: params.lastAgentName,
    correlationId: params.correlationId,
    runState: params.runState,
  });
}

/**
 * Emits the final trust summary.
 */
export function emitAgentSummary(
  emit: AgentEventEmitter,
  params: {
    runId: string;
    trust: AgentSummaryTrust;
  },
): void {
  emit({
    type: "agent_summary",
    runId: params.runId,
    trust: params.trust,
  });
}

/**
 * Emits the terminal run event.
 */
export function emitDone(
  emit: AgentEventEmitter,
  params: {
    runId: string;
    status: "succeeded" | "failed" | "canceled";
    conversationId?: string;
  },
): void {
  emit({
    type: "done",
    runId: params.runId,
    status: params.status,
    conversationId: params.conversationId,
  });
}

/**
 * Emits an error event.
 */
export function emitError(emit: AgentEventEmitter, message: string): void {
  emit({ type: "error", message });
}

/**
 * Emits any map_action events implied by a tool result.
 */
export function emitMapActionsFromToolResult(
  emit: AgentEventEmitter,
  params: {
    toolName: string;
    result: unknown;
    toolCallId?: string | null;
  },
): void {
  for (const event of buildMapActionEventsFromToolResult(
    params.toolName,
    params.result,
    params.toolCallId,
  )) {
    emit(event);
  }
}
