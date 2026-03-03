/* ------------------------------------------------------------------
 * Codex Relay Durable Object
 * Bridges browser WebSocket clients to the Codex App Server WebSocket.
 * ------------------------------------------------------------------ */

import type { Env } from "./types";

const CLIENT_INFO = {
  name: "magnolia_admin",
  title: "Magnolia Admin",
  version: "1.0.0",
} as const;

const TEXT_DECODER = new TextDecoder();
const INITIALIZE_MESSAGE_ID = "init";
const HANDSHAKE_WAIT_MS = 50;

type ConnectionStatusEvent =
  | "connected"
  | "upstream_open"
  | "upstream_closed"
  | "upstream_error"
  | "error";

type RelayLifecycleMessage = {
  jsonrpc: "2.0";
  method: "connection";
  params: {
    type: ConnectionStatusEvent;
    message?: string;
  };
};

interface CodexInitializeRequest {
  jsonrpc: "2.0";
  id: string;
  method: "initialize";
  params: {
    clientInfo: {
      name: string;
      title: string;
      version: string;
    };
  };
}

interface CodexInitializedNotification {
  jsonrpc: "2.0";
  method: "initialized";
  params: {};
}

export class CodexRelayDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private connectionId = "";
  private clientWs: WebSocket | null = null;
  private upstreamWs: WebSocket | null = null;
  private readonly pendingUpstreamMessages: string[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/codex") {
      return new Response("Not found", { status: 404 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const connectionId = url.searchParams.get("connectionId");
    if (!connectionId) {
      return new Response("Missing connectionId", { status: 400 });
    }

    this.connectionId = connectionId;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    this.clientWs = server;

    try {
      await this.state.storage.put("connectionId", connectionId);
    } catch {
      // best effort
    }

    void this.connectToUpstream();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.clientWs = ws;

    if (typeof message !== "string") {
      if (message instanceof ArrayBuffer) {
        message = TEXT_DECODER.decode(new Uint8Array(message));
      } else {
        this.sendToClients(this.connectionErrorEvent("Invalid message payload"));
        return;
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.sendToClients(this.connectionErrorEvent("Invalid JSON payload"));
      return;
    }

    const requestText = JSON.stringify(parsed);

    if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
      this.pendingUpstreamMessages.push(requestText);
      void this.connectToUpstream();
      return;
    }

    this.upstreamWs.send(requestText);
  }

  async webSocketClose(_ws: WebSocket, _code: number, reason: string, _wasClean: boolean): Promise<void> {
    if (this.clientWs === _ws) {
      this.clientWs = null;
    }

    const activeSockets = this.state.getWebSockets();
    if (activeSockets.length === 0) {
      this.closeUpstream(1000, reason || "Client disconnected");
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Client websocket error";
    this.sendToClients(this.connectionErrorEvent(message));

    if (this.clientWs === ws) {
      this.clientWs = null;
    }

    const activeSockets = this.state.getWebSockets();
    if (activeSockets.length === 0) {
      this.closeUpstream(1000, message);
    }
  }

  private async connectToUpstream(): Promise<void> {
    const appServerUrl = this.env.CODEX_APP_SERVER_URL;
    if (!appServerUrl) {
      this.sendToClients(this.connectionErrorEvent("Missing CODEX_APP_SERVER_URL"));
      return;
    }

    if (this.upstreamWs && this.upstreamWs.readyState === WebSocket.OPEN) {
      this.flushPendingMessages();
      return;
    }

    if (!this.connectionId) {
      const stored = await this.state.storage.get<string>("connectionId");
      this.connectionId = stored ?? this.connectionId;
    }

    const upstream = new WebSocket(appServerUrl);
    this.upstreamWs = upstream;

    upstream.addEventListener("open", () => {
      this.sendToClients(this.connectionStatusEvent("upstream_open", "Upstream websocket open"));
      this.sendInitialize();
      this.flushPendingMessages();
      setTimeout(() => this.sendInitialized(), HANDSHAKE_WAIT_MS);
    });

    upstream.addEventListener("message", (event) => {
      const text = this.coerceUpstreamPayload(event.data);
      if (text === null) {
        return;
      }

      this.sendToClients(text);
    });

    upstream.addEventListener("error", () => {
      this.sendToClients(this.connectionErrorEvent("Upstream websocket error"));
      this.closeUpstream(1011, "Upstream websocket error");
    });

    upstream.addEventListener("close", (event) => {
      this.sendToClients(
        this.connectionErrorEvent(event.reason || `Upstream closed (code ${event.code})`),
      );
      if (this.upstreamWs === upstream) {
        this.sendToClients(
          this.connectionStatusEvent("upstream_closed", `Upstream closed (code ${event.code})`),
        );
        this.upstreamWs = null;
      }
    });
  }

  private sendInitialize(): void {
    const payload: CodexInitializeRequest = {
      jsonrpc: "2.0",
      id: INITIALIZE_MESSAGE_ID,
      method: "initialize",
      params: {
        clientInfo: CLIENT_INFO,
      },
    };

    if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
      return;
    }

    this.upstreamWs.send(JSON.stringify(payload));
  }

  private sendInitialized(): void {
    if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload: CodexInitializedNotification = {
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    };

    this.upstreamWs.send(JSON.stringify(payload));
  }

  private flushPendingMessages(): void {
    if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.pendingUpstreamMessages.length > 0) {
      const next = this.pendingUpstreamMessages.shift();
      if (next !== undefined) {
        try {
          this.upstreamWs.send(next);
        } catch {
          this.pendingUpstreamMessages.unshift(next);
          return;
        }
      }
    }
  }

  private closeUpstream(code: number, reason: string): void {
    if (!this.upstreamWs) {
      return;
    }

    if (this.upstreamWs.readyState === WebSocket.OPEN || this.upstreamWs.readyState === WebSocket.CONNECTING) {
      try {
        this.upstreamWs.close(code, reason);
      } catch {
        // ignore
      }
    }

    this.upstreamWs = null;
    this.pendingUpstreamMessages.length = 0;
  }

  private sendToClients(payload: RelayLifecycleMessage | string): void {
    const sockets = this.state.getWebSockets();
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(data);
        } catch {
          // ignore
        }
      }
    }
  }

  private coerceUpstreamPayload(payload: MessageEvent["data"]): string | null {
    if (typeof payload === "string") {
      return payload;
    }

    if (payload instanceof ArrayBuffer) {
      return TEXT_DECODER.decode(new Uint8Array(payload));
    }

    if (ArrayBuffer.isView(payload)) {
      return TEXT_DECODER.decode(payload);
    }

    return null;
  }

  private connectionStatusEvent(type: ConnectionStatusEvent, message?: string): RelayLifecycleMessage {
    return {
      jsonrpc: "2.0",
      method: "connection",
      params: {
        type,
        message,
      },
    };
  }

  private connectionErrorEvent(message?: string): RelayLifecycleMessage {
    return this.connectionStatusEvent("error", message);
  }
}
