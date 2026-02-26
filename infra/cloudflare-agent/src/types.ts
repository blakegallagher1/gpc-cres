/* ------------------------------------------------------------------
 * Shared types for the Entitlement OS Cloudflare Agent Worker
 * ------------------------------------------------------------------ */

/** Env bindings declared in wrangler.toml + secrets */
export interface Env {
  AGENT_CHAT: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  LOCAL_API_KEY: string;
  LOCAL_API_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  VERCEL_URL: string;
}

/** State persisted in the Durable Object transactional KV store */
export interface ConversationState {
  conversationId: string;
  orgId: string;
  userId: string;
  userToken: string;
  lastResponseId: string | null;
  model: string;
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;
}

/** Message sent from the browser over WebSocket */
export interface ClientMessage {
  type: "message";
  text: string;
  dealId?: string;
}

/** Events sent from Worker → Browser (matches ChatStreamEvent in streamEventTypes.ts) */
export type WorkerEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_start"; name: string; args?: Record<string, unknown>; toolCallId?: string }
  | { type: "tool_end"; name: string; result?: unknown; status?: "completed" | "failed"; toolCallId?: string }
  | { type: "agent_switch"; agentName: string }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; runId?: string; conversationId?: string }
  | { type: "operation_progress"; operationId: string; label: string; pct: number }
  | { type: "operation_done"; operationId: string; label: string; summary: string }
  | { type: "operation_error"; operationId: string; label: string; error: string };

/** Tool schema as stored in generated/tool-schemas.json (Responses API flat format) */
export interface ToolSchema {
  type: "function" | "web_search_preview" | "file_search";
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

/** OpenAI Responses API WebSocket events (subset we handle) */
export type OpenAIEvent =
  | { type: "response.created"; response: { id: string } }
  | { type: "response.in_progress" }
  | { type: "response.output_text.delta"; delta: string; item_id: string }
  | {
      type: "response.output_item.added";
      item: {
        id: string;
        type: string;
        name?: string;
        call_id?: string;
      };
    }
  | {
      type: "response.function_call_arguments.delta";
      delta: string;
      item_id: string;
      call_id: string;
    }
  | {
      type: "response.function_call_arguments.done";
      call_id: string;
      name: string;
      arguments: string;
      item_id: string;
      response_id: string;
    }
  | { type: "response.completed"; response: { id: string; output: unknown[] } }
  | { type: "response.failed"; response: { id: string; error?: { message: string } } }
  | { type: "response.output_item.done"; item: { id: string; type: string; [key: string]: unknown } }
  | {
      type: "error";
      error?: {
        message?: string;
        code?: string;
        type?: string;
        [key: string]: unknown;
      };
      message?: string;
      code?: string;
    };
