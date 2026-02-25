/* ------------------------------------------------------------------
 * AgentChatDO — Durable Object that holds a persistent WebSocket to
 * both the browser and OpenAI's Responses API, managing the full
 * agent tool-call loop with unlimited duration.
 * ------------------------------------------------------------------ */

import type {
  Env,
  ConversationState,
  ClientMessage,
  WorkerEvent,
  OpenAIEvent,
  ToolSchema,
} from "./types";
import { executeTool, routeTool } from "./tool-router";
import toolSchemas from "./generated/tool-schemas.json";
import instructions from "./generated/instructions.json";

// Cloudflare Workers fetch() uses https:// for WebSocket upgrade, not wss://
const OPENAI_WS_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4.1";
const RECONNECT_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // reconnect at 55min
const MAX_RECONNECT_ATTEMPTS = 2;

export class AgentChatDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  // Active WebSocket connections
  private clientWs: WebSocket | null = null;
  private openaiWs: WebSocket | null = null;
  private openaiConnectedAt: number = 0;

  // Conversation state (hydrated from storage on first access)
  private conv: ConversationState | null = null;
  private stateLoaded = false;

  // Pending tool calls accumulator (for current response)
  private pendingToolArgs: Map<string, string> = new Map(); // item_id → partial args
  private pendingToolNames: Map<string, string> = new Map(); // item_id → tool name (from output_item.added)
  private pendingToolCallIds: Map<string, string> = new Map(); // item_id → call_id (from output_item.added)
  private currentResponseId: string | null = null;
  private activeToolCalls: number = 0; // track in-flight tool calls for this response
  private awaitingToolResponse: boolean = false; // true after submitting tool result, before next response.created

  // Context for current turn
  private currentDealId: string | undefined;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.handleWebSocket(request, url);
    }

    return new Response("Not found", { status: 404 });
  }

  /* ----------------------------------------------------------------
   * WebSocket setup
   * -------------------------------------------------------------- */

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    // Extract auth context passed by the Worker entry point
    const orgId = url.searchParams.get("orgId") ?? "";
    const userId = url.searchParams.get("userId") ?? "";
    const userToken = url.searchParams.get("token") ?? "";
    const conversationId = url.searchParams.get("conversationId") ?? "";

    if (!orgId || !userId || !conversationId) {
      return new Response("Missing auth context", { status: 400 });
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    this.clientWs = server;

    // Load or initialize conversation state
    await this.loadState(conversationId, orgId, userId, userToken);

    return new Response(null, { status: 101, webSocket: client });
  }

  /* ----------------------------------------------------------------
   * Durable Object WebSocket handlers (Hibernation API)
   * -------------------------------------------------------------- */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.sendToClient({ type: "error", message: "Invalid JSON message" });
      return;
    }

    if (parsed.type !== "message" || !parsed.text) {
      this.sendToClient({ type: "error", message: "Expected { type: 'message', text: '...' }" });
      return;
    }

    this.currentDealId = parsed.dealId;

    await this.handleUserMessage(parsed.text);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.clientWs = null;
    // Clean up OpenAI WS if browser disconnects
    this.closeOpenAI();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("Client WebSocket error:", error);
    this.clientWs = null;
    this.closeOpenAI();
  }

  /* ----------------------------------------------------------------
   * State management
   * -------------------------------------------------------------- */

  private async loadState(
    conversationId: string,
    orgId: string,
    userId: string,
    userToken: string,
  ): Promise<void> {
    if (this.stateLoaded && this.conv) {
      // Update token in case it changed (reconnect with fresh JWT)
      this.conv.userToken = userToken;
      this.conv.lastActiveAt = Date.now();
      await this.persistState();
      return;
    }

    const stored = await this.state.storage.get<ConversationState>("conv");
    if (stored) {
      this.conv = { ...stored, userToken, lastActiveAt: Date.now() };
    } else {
      this.conv = {
        conversationId,
        orgId,
        userId,
        userToken,
        lastResponseId: null,
        model: MODEL,
        turnCount: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };
    }
    this.stateLoaded = true;
    await this.persistState();
  }

  private async persistState(): Promise<void> {
    if (this.conv) {
      await this.state.storage.put("conv", this.conv);
    }
  }

  /* ----------------------------------------------------------------
   * User message → OpenAI request
   * -------------------------------------------------------------- */

  private async handleUserMessage(text: string): Promise<void> {
    if (!this.conv) return;

    this.conv.turnCount++;
    this.conv.lastActiveAt = Date.now();

    // Ensure OpenAI WebSocket is connected
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      const connected = await this.connectOpenAI();
      if (!connected) {
        this.sendToClient({
          type: "error",
          message: "Failed to connect to OpenAI. Please try again.",
          code: "OPENAI_ERROR",
        });
        return;
      }
    }

    // Build the response.create request (flat structure per OpenAI WebSocket mode docs)
    const input: unknown[] = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    ];

    const request: Record<string, unknown> = {
      type: "response.create",
      model: this.conv.model,
      input,
      tools: toolSchemas as ToolSchema[],
      store: true,
    };

    // First turn: include instructions. Continuations: use previous_response_id
    if (this.conv.lastResponseId) {
      request.previous_response_id = this.conv.lastResponseId;
    } else {
      request.instructions =
        (instructions as { COORDINATOR_INSTRUCTIONS: string }).COORDINATOR_INSTRUCTIONS;
    }

    this.openaiWs!.send(JSON.stringify(request));
  }

  /* ----------------------------------------------------------------
   * OpenAI WebSocket connection
   * -------------------------------------------------------------- */

  private async connectOpenAI(): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        const resp = await fetch(OPENAI_WS_URL, {
          headers: {
            Upgrade: "websocket",
            Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
          },
        });

        const ws = (resp as unknown as { webSocket?: WebSocket }).webSocket;
        if (!ws) {
          const status = resp.status;
          const body = await resp.text().catch(() => "(no body)");
          console.error(
            `OpenAI WebSocket upgrade failed: status=${status}, body=${body.slice(0, 500)}, attempt=${attempt}`,
          );
          if (attempt < MAX_RECONNECT_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }
          return false;
        }

        ws.accept();
        this.openaiWs = ws;
        this.openaiConnectedAt = Date.now();
        this.setupOpenAIHandlers(ws);

        // Schedule proactive reconnect before 60min expiry
        this.state.storage.setAlarm(Date.now() + RECONNECT_BEFORE_EXPIRY_MS);

        return true;
      } catch (err) {
        console.error("OpenAI connect error:", err);
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        return false;
      }
    }
    return false;
  }

  private setupOpenAIHandlers(ws: WebSocket): void {
    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        // Must use waitUntil to ensure async tool execution completes
        this.state.waitUntil(this.handleOpenAIMessage(event.data));
      }
    });

    ws.addEventListener("close", () => {
      this.openaiWs = null;
    });

    ws.addEventListener("error", (event) => {
      console.error("OpenAI WebSocket error:", event);
      this.openaiWs = null;
    });
  }

  private closeOpenAI(): void {
    if (this.openaiWs) {
      try {
        this.openaiWs.close(1000, "Client disconnected");
      } catch {
        // ignore
      }
      this.openaiWs = null;
    }
  }

  /** Durable Object alarm handler — proactive OpenAI WS reconnect */
  async alarm(): Promise<void> {
    // If OpenAI WS is still open and approaching 60min, reconnect
    if (
      this.openaiWs &&
      Date.now() - this.openaiConnectedAt > RECONNECT_BEFORE_EXPIRY_MS - 60_000
    ) {
      this.closeOpenAI();
      // Don't reconnect eagerly — wait for next message
    }
  }

  /* ----------------------------------------------------------------
   * Process OpenAI Responses API events
   * -------------------------------------------------------------- */

  private async handleOpenAIMessage(raw: string): Promise<void> {
    let event: OpenAIEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      console.error("Invalid JSON from OpenAI:", raw.slice(0, 200));
      return;
    }

    switch (event.type) {
      case "response.created":
        this.currentResponseId = event.response.id;
        this.awaitingToolResponse = false; // New response started, safe to track done again
        break;

      case "response.output_text.delta":
        // Stream text tokens to the browser
        this.sendToClient({ type: "text_delta", content: event.delta });
        break;

      case "response.output_item.added":
        if (event.item.type === "function_call" && event.item.name) {
          // Track tool name and call_id by item ID for lookup in function_call_arguments.done
          this.pendingToolNames.set(event.item.id, event.item.name);
          if (event.item.call_id) {
            this.pendingToolCallIds.set(event.item.id, event.item.call_id);
          }
          this.sendToClient({
            type: "tool_start",
            name: event.item.name,
            toolCallId: event.item.call_id,
          });
        }
        break;

      case "response.function_call_arguments.delta":
        // Accumulate partial arguments
        const existing = this.pendingToolArgs.get(event.item_id) ?? "";
        this.pendingToolArgs.set(event.item_id, existing + event.delta);
        break;

      case "response.function_call_arguments.done":
        this.activeToolCalls++;
        this.pendingToolArgs.delete(event.item_id);
        // Resolve tool name and call_id from tracked Maps (output_item.added)
        // These fields may be absent from function_call_arguments.done in WebSocket mode
        const toolName = event.name || this.pendingToolNames.get(event.item_id) || "unknown";
        const callId = event.call_id || this.pendingToolCallIds.get(event.item_id);
        this.pendingToolNames.delete(event.item_id);
        this.pendingToolCallIds.delete(event.item_id);
        if (!callId) {
          console.error("CRITICAL: No call_id found for tool call, cannot submit result");
          this.activeToolCalls = 0;
          this.sendToClient({ type: "error", message: "Internal error: missing call_id for tool result", code: "INTERNAL_ERROR" });
          break;
        }
        // Use currentResponseId (from response.created) — response_id on this event may be undefined
        const responseIdForTool = this.currentResponseId ?? event.response_id;
        await this.handleToolCall(
          callId,
          toolName,
          event.arguments,
          responseIdForTool,
        );
        // activeToolCalls is decremented after tool result is submitted to OpenAI
        break;

      case "response.completed":
        // Update lastResponseId for conversation chaining
        if (this.conv) {
          this.conv.lastResponseId = event.response.id;
          await this.persistState();
        }

        // Only send "done" if:
        // 1. No tool calls are in-flight (activeToolCalls === 0)
        // 2. We're NOT awaiting a response from a tool result we just submitted
        //    (race: fast tool execution finishes before response.completed for response A)
        if (this.activeToolCalls === 0 && !this.awaitingToolResponse) {
          this.sendToClient({
            type: "done",
            runId: event.response.id,
            conversationId: this.conv?.conversationId,
          });
        }
        // else: tool calls in-flight or awaiting response — done will fire on final response.completed
        break;

      case "response.failed":
        const errorMsg =
          event.response.error?.message ?? "OpenAI response failed";
        console.error("OpenAI response failed:", errorMsg);
        this.sendToClient({
          type: "error",
          message: errorMsg,
          code: "OPENAI_ERROR",
        });
        break;

      case "response.output_item.done":
        // Hosted tool results (web_search, etc.) come through here
        if (event.item.type === "web_search_call" || event.item.type === "file_search_call") {
          this.sendToClient({
            type: "tool_end",
            name: event.item.type.replace("_call", ""),
            status: "completed",
            toolCallId: event.item.id,
          });
        }
        break;

      case "error":
        // OpenAI WebSocket protocol error (invalid request, etc.)
        const wsError = (event as Record<string, unknown>).error as Record<string, string> | undefined;
        const wsErrorMsg = wsError?.message ?? "Unknown OpenAI WebSocket error";
        console.error("OpenAI WebSocket error event:", wsErrorMsg);
        this.awaitingToolResponse = false;
        this.activeToolCalls = 0;
        this.sendToClient({
          type: "error",
          message: wsErrorMsg,
          code: "OPENAI_ERROR",
        });
        break;

      default:
        break;
    }
  }

  /* ----------------------------------------------------------------
   * Tool call execution + result submission
   * -------------------------------------------------------------- */

  private async handleToolCall(
    callId: string,
    toolName: string,
    argsJson: string,
    responseId: string,
  ): Promise<void> {
    if (!this.conv) return;

    const destination = routeTool(toolName);

    if (destination === "hosted") {
      // Hosted tools are handled by OpenAI — just forward events
      return;
    }

    // Execute the tool
    const resultJson = await executeTool(
      this.env,
      toolName,
      argsJson,
      this.conv.userToken,
      {
        conversationId: this.conv.conversationId,
        dealId: this.currentDealId,
      },
    );

    // Send tool_end to browser
    let parsedResult: unknown;
    try {
      parsedResult = JSON.parse(resultJson);
    } catch {
      parsedResult = resultJson;
    }

    const hasError =
      typeof parsedResult === "object" &&
      parsedResult !== null &&
      "error" in parsedResult;

    this.sendToClient({
      type: "tool_end",
      name: toolName,
      result: parsedResult,
      status: hasError ? "failed" : "completed",
      toolCallId: callId,
    });

    // Check for auth errors and notify client
    if (
      hasError &&
      typeof (parsedResult as Record<string, unknown>).error === "string" &&
      ((parsedResult as Record<string, string>).error.includes("Authentication failed") ||
        (parsedResult as Record<string, string>).error.includes("session may have expired"))
    ) {
      this.sendToClient({
        type: "error",
        code: "AUTH_EXPIRED",
        message: "Session expired. Please refresh the page.",
      });
    }

    // Submit tool result back to OpenAI
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) {
      this.activeToolCalls = 0;
      this.sendToClient({
        type: "error",
        message: "OpenAI connection lost during tool execution",
        code: "OPENAI_ERROR",
      });
      return;
    }

    // Reset counter before sending — the next response.create will trigger
    // a new response with its own completed event
    this.activeToolCalls = 0;

    const toolResponse: Record<string, unknown> = {
      type: "response.create",
      model: this.conv.model,
      input: [
        {
          type: "function_call_output",
          call_id: callId,
          output: resultJson,
        },
      ],
    };

    // Only include previous_response_id if we have one
    if (responseId) {
      toolResponse.previous_response_id = responseId;
    }

    this.awaitingToolResponse = true; // Don't send "done" until next response.created arrives
    this.openaiWs.send(JSON.stringify(toolResponse));
  }

  /* ----------------------------------------------------------------
   * Client communication
   * -------------------------------------------------------------- */

  private sendToClient(event: WorkerEvent): void {
    if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(event));
    }
  }
}
