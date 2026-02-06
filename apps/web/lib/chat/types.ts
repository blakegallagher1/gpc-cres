export type ChatStreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown>; result?: string }
  | { type: "agent_switch"; agentName: string }
  | { type: "error"; message: string }
  | { type: "done"; conversationId: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  agentName?: string;
  toolCalls?: unknown[];
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  dealId: string | null;
  updatedAt: string;
  messageCount: number;
};
