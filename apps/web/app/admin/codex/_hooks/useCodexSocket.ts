"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isCodexNotification,
  isCodexResponse,
  type CodexClientMethod,
  type CodexClientRequestByMethod,
  type CodexClientResultByMethod,
  type CodexJsonRpcId,
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
  type JsonRpcResponseEnvelope,
  parseCodexMessage,
} from "../_lib/codex-protocol";
import {
  makeRequest,
  rpcErrorFromCodexResponse,
  type PendingResponseState,
  nextRequestId,
} from "../_lib/codex-rpc";
import { API_ROUTE_PATH, RECONNECT_BACKOFF_MS } from "../_lib/constants";

/**
 * Relay connection lifecycle events sent as SSE frames from the server.
 * These are NOT Codex protocol messages — they track the relay ↔ upstream WS state.
 */
interface RelayConnectionEvent {
  jsonrpc: "2.0";
  method: "connection";
  params: {
    type: "connected" | "upstream_open" | "upstream_closed" | "upstream_error" | "error";
    message?: string;
  };
}

function isRelayConnectionEvent(data: unknown): data is RelayConnectionEvent {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.jsonrpc !== "2.0" || obj.method !== "connection") return false;
  const params = obj.params;
  return (
    typeof params === "object" &&
    params !== null &&
    typeof (params as Record<string, unknown>).type === "string"
  );
}

export type CodexConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseCodexSocketHandlers {
  onNotification: (message: JsonRpcIncomingMessage) => void;
  onResponse: (message: JsonRpcResponseEnvelope<unknown>) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionError?: (message: string) => void;
}

export interface UseCodexSocketResult {
  status: CodexConnectionStatus;
  isConnected: boolean;
  send: (payload: JsonRpcIncomingMessage | JsonRpcNotification<unknown>) => Promise<void>;
  sendRequest: <M extends CodexClientMethod>(
    method: M,
    params: CodexClientRequestByMethod[M],
  ) => Promise<CodexClientResultByMethod[M]>;
  reconnect: () => void;
  connectionStatusText: string;
  connectionError: string | null;
}

type RelayPayload = JsonRpcIncomingMessage | JsonRpcNotification<unknown>;
const INITIALIZE_RESPONSE_ID = "init";

function createPendingState(): PendingResponseState<unknown> {
  return {
    resolve: () => undefined,
    reject: () => undefined,
    timer: setTimeout(() => {}, 0),
  };
}

function useIsWebSocketRelay(): boolean {
  return API_ROUTE_PATH.startsWith("ws://") || API_ROUTE_PATH.startsWith("wss://");
}

export function useCodexSocket({
  connectionId,
  handlers,
  enabled,
}: {
  connectionId: string;
  handlers: UseCodexSocketHandlers;
  enabled: boolean;
}): UseCodexSocketResult {
  const [status, setStatus] = useState<CodexConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const shouldRunRef = useRef(false);
  const handshakeReadyRef = useRef(false);
  const outboundQueueRef = useRef<RelayPayload[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingRef = useRef(new Map<CodexJsonRpcId, PendingResponseState<unknown>>());
  const handlersRef = useRef(handlers);
  const useWebSocketRelay = useIsWebSocketRelay();

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeTransports = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
  }, []);

  const rejectAllPending = useCallback((error: Error) => {
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingRef.current.clear();
  }, []);

  const sendPayload = useCallback(
    async (payload: RelayPayload) => {
      if (useWebSocketRelay) {
        const activeSocket = webSocketRef.current;
        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
          throw new Error("Relay WebSocket is not connected");
        }

        activeSocket.send(JSON.stringify(payload));
        return;
      }

      const response = await fetch(API_ROUTE_PATH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          payload,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to send request (${response.status})`);
      }
    },
    [connectionId, useWebSocketRelay],
  );

  const flushQueuedPayloads = useCallback(async () => {
    if (!handshakeReadyRef.current) {
      return;
    }

    if (outboundQueueRef.current.length === 0) {
      return;
    }

    const queued = outboundQueueRef.current.splice(0, outboundQueueRef.current.length);
    for (const queuedPayload of queued) {
      try {
        await sendPayload(queuedPayload);
      } catch {
        outboundQueueRef.current.unshift(queuedPayload);
        return;
      }
    }
  }, [sendPayload]);

  const handleRelayPayload = useCallback((rawPayload: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      return;
    }

    if (isRelayConnectionEvent(parsed)) {
      const { type: connType, message: connMsg } = parsed.params;
      if (connType === "upstream_open") {
        setStatus("connected");
        setConnectionError(null);
        handlersRef.current.onConnected?.();
      } else if (connType === "upstream_error") {
        setConnectionError(connMsg ?? "Upstream connection error");
        handlersRef.current.onConnectionError?.(connMsg ?? "Upstream connection error");
      } else if (connType === "upstream_closed") {
        setConnectionError(connMsg ?? "Upstream connection closed");
        handlersRef.current.onConnectionError?.(connMsg ?? "Upstream connection closed");
      } else if (connType === "error") {
        setConnectionError(connMsg ?? "Relay error");
        handlersRef.current.onConnectionError?.(connMsg ?? "Relay error");
      }

      return;
    }

    const message = parseCodexMessage(parsed);
    if (!message) {
      return;
    }

    if (isCodexResponse(message)) {
      const pending = pendingRef.current.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRef.current.delete(message.id);

        if (message.error) {
          pending.reject(rpcErrorFromCodexResponse(message.error));
        } else {
          pending.resolve(message.result as unknown);
        }
      }

      if (String(message.id) === INITIALIZE_RESPONSE_ID) {
        handshakeReadyRef.current = true;
        void flushQueuedPayloads();
      }

      handlersRef.current.onResponse(message);
      return;
    }

    if (isCodexNotification(message)) {
      handlersRef.current.onNotification(message);
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    const currentAttempt = reconnectAttemptRef.current;
    if (currentAttempt >= RECONNECT_BACKOFF_MS.length) {
      setStatus("failed");
      setConnectionError("Unable to reconnect to Codex relay after multiple attempts.");
      handlersRef.current.onConnectionError?.("Unable to reconnect. Retry manually.");
      return;
    }

    const delay = RECONNECT_BACKOFF_MS[currentAttempt];
    reconnectAttemptRef.current += 1;
    setStatus("reconnecting");
    setConnectionError(`Reconnecting in ${Math.round(delay / 1000)}s...`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void connect();
    }, delay);
  }, []);

  const connect = useCallback(async () => {
    if (!shouldRunRef.current) {
      return;
    }

    handshakeReadyRef.current = false;
    outboundQueueRef.current = [];

    clearReconnectTimer();
    closeTransports();

    setStatus((current) => (current === "idle" ? "connecting" : "reconnecting"));
    setConnectionError(null);

    if (useWebSocketRelay) {
      const url = `${API_ROUTE_PATH}?connectionId=${encodeURIComponent(connectionId)}`;
      const socket = new WebSocket(url);
      webSocketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionError(null);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        handleRelayPayload(event.data);
      };

      const handleSocketFailure = () => {
        handlersRef.current.onConnectionError?.("Connection to admin Codex relay lost");

        if (!shouldRunRef.current) {
          setStatus("idle");
          setConnectionError(null);
          handlersRef.current.onDisconnected?.();
          return;
        }

        scheduleReconnect();
      };

      socket.onerror = () => {
        handleSocketFailure();
      };

      socket.onclose = () => {
        handleSocketFailure();
      };

      return;
    }

    const url = `${API_ROUTE_PATH}?connectionId=${encodeURIComponent(connectionId)}`;
    const source = new EventSource(url);
    eventSourceRef.current = source;

    source.onopen = () => {
      reconnectAttemptRef.current = 0;
      setConnectionError(null);
      // Don't set "connected" yet — the upstream WebSocket may still be CONNECTING.
      // Status transitions to "connected" only when the server sends upstream_open.
    };

    source.onmessage = (event) => {
      handleRelayPayload(event.data);
    };

    source.onerror = () => {
      handlersRef.current.onConnectionError?.("Connection to admin Codex relay lost");
      source.close();
      eventSourceRef.current = null;

      if (!shouldRunRef.current) {
        setStatus("idle");
        setConnectionError(null);
        handlersRef.current.onDisconnected?.();
        return;
      }

      scheduleReconnect();
    };
  }, [clearReconnectTimer, closeTransports, connectionId, handleRelayPayload, scheduleReconnect, useWebSocketRelay]);

  const sendToRelay = useCallback(
    async (payload: RelayPayload) => {
      if (!handshakeReadyRef.current) {
        outboundQueueRef.current.push(payload);
        return;
      }

      await sendPayload(payload);
    },
    [sendPayload],
  );

  const send = useCallback(
    (payload: JsonRpcIncomingMessage | JsonRpcNotification<unknown>) => {
      return sendToRelay(payload);
    },
    [sendToRelay],
  );

  const sendRequest = useCallback(
    async <M extends CodexClientMethod>(
      method: M,
      params: CodexClientRequestByMethod[M],
    ): Promise<CodexClientResultByMethod[M]> => {
      const requestId = nextRequestId();
      const request = makeRequest(method, params, requestId);

      const pendingState = createPendingState();
      const promise = new Promise<unknown>((resolve, reject) => {
        pendingState.resolve = resolve;
        pendingState.reject = reject;
      });

      pendingState.timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        pendingState.reject(new Error("Codex request timed out"));
      }, 45_000);

      pendingRef.current.set(requestId, pendingState);

      try {
        await sendToRelay(request);
      } catch (error) {
        clearTimeout(pendingState.timer);
        pendingRef.current.delete(requestId);
        throw error;
      }

      const result = (await promise) as CodexClientResultByMethod[M];
      return result;
    },
    [sendToRelay],
  );

  const resetConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    resetConnectionError();
    rejectAllPending(new Error("Reconnecting"));
    void connect();
  }, [clearReconnectTimer, connect, rejectAllPending, resetConnectionError]);

  useEffect(() => {
    shouldRunRef.current = enabled;

    if (!enabled) {
      clearReconnectTimer();
      closeTransports();
      rejectAllPending(new Error("Codex relay disconnected"));
      setStatus("idle");
      setConnectionError(null);
      return;
    }

    void connect();

    return () => {
      shouldRunRef.current = false;
      clearReconnectTimer();
      closeTransports();
      rejectAllPending(new Error("Codex relay disconnected"));
      setStatus("idle");
      setConnectionError(null);
    };
  }, [clearReconnectTimer, closeTransports, connect, enabled, rejectAllPending]);

  const statusText = {
    idle: "Disconnected",
    connecting: "Connecting",
    connected: "Connected",
    reconnecting: "Reconnecting",
    failed: "Failed",
  }[status];

  return {
    status,
    isConnected: status === "connected",
    send,
    sendRequest,
    reconnect,
    connectionStatusText: statusText,
    connectionError,
  };
}
