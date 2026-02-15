import {
  type ChatMessage,
  type ChatStreamEvent,
  type ChatTrustSnapshot,
  type ChatToolCall,
} from "./types";

export type StreamPresenterState = {
  assistantDraft: string;
  assistantMessageId: string | null;
  progressMessageId: string | null;
  lastAgentName: string | null;
  conversationId: string | null;
};

export type StreamPresenterResult = {
  nextState: StreamPresenterState;
  nextMessages: ChatMessage[];
};

type IdGenerator = (prefix: string) => string;

const nowForId = (): string => `${Date.now()}`;

export function createStreamPresenterState(): StreamPresenterState {
  return {
    assistantDraft: "",
    assistantMessageId: null,
    progressMessageId: null,
    lastAgentName: null,
    conversationId: null,
  };
}

const defaultIdGenerator: IdGenerator = (prefix: string) =>
  `${prefix}-${nowForId()}-${Math.random().toString(36).slice(2, 8)}`;

function replaceMessageById(
  messages: ChatMessage[],
  messageId: string,
  message: ChatMessage,
): ChatMessage[] {
  const exists = messages.some((entry) => entry.id === messageId);
  if (!exists) {
    return [...messages, message];
  }
  return messages.map((entry) => (entry.id === messageId ? message : entry));
}

function normalizeAgentName(name?: string): string | undefined {
  if (!name || !name.trim()) {
    return undefined;
  }
  return name;
}

function normalizeToolCall(event: ChatStreamEvent): ChatToolCall | null {
  if (event.type !== "tool_call" && event.type !== "tool_result") {
    return null;
  }

  return {
    name: event.name,
    args:
      event.type === "tool_call" &&
      typeof event.args === "object" &&
      event.args !== null
        ? event.args
        : undefined,
    result:
      event.type === "tool_call"
        ? event.result
        : event.type === "tool_result"
          ? event.result
          : undefined,
  };
}

function createTrustSnapshot(event: ChatStreamEvent): ChatTrustSnapshot | undefined {
  if (event.type !== "agent_summary") {
    return undefined;
  }

  return {
    lastAgentName: event.trust.lastAgentName,
    confidence: event.trust.confidence,
    toolsInvoked: event.trust.toolsInvoked,
    packVersionsUsed: event.trust.packVersionsUsed,
    missingEvidence: event.trust.missingEvidence,
    verificationSteps: event.trust.verificationSteps,
    proofChecks: event.trust.proofChecks,
    evidenceCitations: event.trust.evidenceCitations,
    durationMs: event.trust.durationMs,
    runId: event.runId,
    errorSummary: event.trust.errorSummary,
    toolFailures: event.trust.toolFailures,
  };
}

type AgentSummaryEvent = Extract<ChatStreamEvent, { type: "agent_summary" }>;

function eventToSummaryMessage(
  event: AgentSummaryEvent,
  now: string,
  idGenerator: IdGenerator,
): ChatMessage {
  const confidence = event.trust.confidence;
  const missingEvidence = event.trust.missingEvidence ?? [];
  const toolCount = event.trust.toolsInvoked?.length ?? 0;

  return {
    id: idGenerator("chat-summary"),
    role: "system",
    content: `Agent summary: ${Math.round((confidence ?? 0) * 100)}% confidence with ${toolCount} tools, ${missingEvidence.length} evidence gaps.`,
    createdAt: now,
    agentName: normalizeAgentName(event.trust.lastAgentName),
    eventKind: "agent_summary",
    trust: createTrustSnapshot(event),
  };
}

function eventToToolMessage(
  event: ChatStreamEvent,
  now: string,
  idGenerator: IdGenerator,
): ChatMessage | null {
  const toolCall = normalizeToolCall(event);
  if (!toolCall) return null;

  return {
    id: idGenerator("chat-tool"),
    role: "assistant",
    content:
      event.type === "tool_call"
        ? `Tool ${toolCall.name} is executing`
        : typeof toolCall.result === "string"
          ? toolCall.result
          : JSON.stringify(toolCall.result ?? "Tool result"),
    createdAt: now,
    eventKind: event.type === "tool_call" ? "tool" : "tool_result",
    toolCalls: [toolCall],
  };
}

export function applyStreamingEvent(
  state: StreamPresenterState,
  messages: ChatMessage[],
  event: ChatStreamEvent,
  now = new Date().toISOString(),
  generateId: IdGenerator = defaultIdGenerator,
): StreamPresenterResult {
  if (event.type === "text_delta") {
    const assistantMessageId =
      state.assistantMessageId ?? generateId("chat-assistant");
    const assistantDraft = `${state.assistantDraft}${event.content}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: assistantDraft,
      createdAt: now,
      eventKind: "assistant",
      agentName: normalizeAgentName(state.lastAgentName ?? undefined),
    };

    return {
      nextState: {
        ...state,
        assistantMessageId,
        assistantDraft,
      },
      nextMessages: replaceMessageById(messages, assistantMessageId, assistantMessage),
    };
  }

  if (event.type === "agent_progress") {
    const content = event.partialOutput ?? state.assistantDraft;
    const nextAgentName =
      normalizeAgentName(event.lastAgentName ?? state.lastAgentName);
    const progressMessage: ChatMessage = {
      id: state.progressMessageId ?? generateId("chat-progress"),
      role: "system",
      content,
      createdAt: now,
      agentName: nextAgentName,
      eventKind: "agent_progress",
      toolCalls:
        (event.toolsInvoked ?? []).map((name) => ({ name })) ?? undefined,
    };

    return {
      nextState: {
        ...state,
        assistantDraft: content,
        lastAgentName: nextAgentName,
        progressMessageId: progressMessage.id,
      },
      nextMessages: replaceMessageById(messages, progressMessage.id, progressMessage),
    };
  }

  if (event.type === "agent_switch") {
    const switchMessage: ChatMessage = {
      id: generateId("chat-switch"),
      role: "system",
      content: `Agent switched to ${event.agentName}`,
      createdAt: now,
      agentName: normalizeAgentName(event.agentName),
      eventKind: "agent_switch",
    };

    return {
      nextState: {
        ...state,
        lastAgentName: event.agentName,
        progressMessageId: null,
      },
      nextMessages: [...messages, switchMessage],
    };
  }

  if (event.type === "agent_summary") {
    const summaryMessage = eventToSummaryMessage(event, now, generateId);
    return {
      nextState: {
        ...state,
        progressMessageId: null,
        lastAgentName: event.trust.lastAgentName ?? state.lastAgentName,
      },
      nextMessages: [...messages, summaryMessage],
    };
  }

  if (event.type === "tool_call" || event.type === "tool_result") {
    const toolMessage = eventToToolMessage(event, now, generateId);
    if (!toolMessage) {
      return { nextState: state, nextMessages: messages };
    }

    return {
      nextState: state,
      nextMessages: [...messages, toolMessage],
    };
  }

  if (event.type === "error") {
    const errorMessage: ChatMessage = {
      id: generateId("chat-error"),
      role: "system",
      content: event.message,
      createdAt: now,
      eventKind: "error",
    };

    return {
      nextState: {
        ...state,
        progressMessageId: null,
      },
      nextMessages: [...messages, errorMessage],
    };
  }

  if (event.type === "done") {
    return {
      nextState: {
        ...state,
        conversationId: event.conversationId ?? state.conversationId,
        progressMessageId: null,
        assistantMessageId: state.assistantMessageId,
      },
      nextMessages: messages,
    };
  }

  if (event.type === "agent_progress_summary") {
    const summary: ChatMessage = {
      id: generateId("chat-progress-summary"),
      role: "system",
      content: event.message,
      createdAt: now,
      agentName: normalizeAgentName(event.agentName),
      eventKind: "agent_progress",
    };

    return {
      nextState: {
        ...state,
        progressMessageId: null,
        lastAgentName: normalizeAgentName(event.agentName) ?? state.lastAgentName,
      },
      nextMessages: [...messages, summary],
    };
  }

  return {
    nextState: state,
    nextMessages: messages,
  };
}

export function applyStreamingEvents(
  initialState: StreamPresenterState,
  initialMessages: ChatMessage[],
  events: ChatStreamEvent[],
  nowFn: () => string = () => new Date().toISOString(),
  generateId: IdGenerator = defaultIdGenerator,
): StreamPresenterResult {
  let currentState = { ...initialState };
  let currentMessages = [...initialMessages];

  for (const event of events) {
    const { nextState, nextMessages } = applyStreamingEvent(
      currentState,
      currentMessages,
      event,
      nowFn(),
      generateId,
    );
    currentState = nextState;
    currentMessages = nextMessages;
  }

  return {
    nextState: currentState,
    nextMessages: currentMessages,
  };
}
