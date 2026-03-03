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

interface RelayConnectionEvent {
  jsonrpc: "2.0";
  method: "connection";
  params: {
    type: "connected" | "upstream_open" | "upstream_closed" | "upstream_error" | "error";
    message?: string;
  };
}

function isRelayConnectionEvent(data: unknown): data is RelayConnectionEvent {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (obj.jsonrpc !== "2.0" || obj.method !== "connection") {
    return false;
  }
  if (typeof obj.params !== "object" || obj.params === null) {
    return false;
  }
  return typeof (obj.params as Record<string, unknown>).type === "string";
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
const FALLBACK_RELAY_URL = "/api/admin/codex";

function createPendingState(): PendingResponseState<unknown> {
  return {
    resolve: () => undefined,
    reject: () => undefined,
    timer: setTimeout(() => {}, 0),
  };
}

function isWebSocketRelay(url: string): boolean {
  return url.startsWith("ws://") || url.startsWith("wss://");
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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const handshakeReadyRef = useRef(false);
  const outboundQueueRef = useRef<RelayPayload[]>([]);
  const pendingRef = useRef(new Map<CodexJsonRpcId, PendingResponseState<unknown>>());
  const handlersRef = useRef(handlers);
  const activeRelayUrlRef = useRef(API_ROUTE_PATH);
  const fallbackAttemptedRef = useRef(false);
  const connectRef = useRef<(() => Promise<void>) | null>(null);

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

  const handleRelayPayload = useCallback((rawPayload: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      return;
    }

    if (isRelayConnectionEvent(parsed)) {
      const { type, message } = parsed.params;
      if (type === "upstream_open") {
        setStatus("connected");
        setConnectionError(null);
        handlersRef.current.onConnected?.();
      } else if (type === "upstream_error") {
        const text = message ?? "Upstream connection error";
        setConnectionError(text);
        handlersRef.current.onConnectionError?.(text);
      } else if (type === "upstream_closed") {
        const text = message ?? "Upstream connection closed";
        setConnectionError(text);
        handlersRef.current.onConnectionError?.(text);
      } else if (type === "error") {
        const text = message ?? "Relay error";
        setConnectionError(text);
        handlersRef.current.onConnectionError?.(text);
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
    const attempt = reconnectAttemptRef.current;
    if (attempt >= RECONNECT_BACKOFF_MS.length) {
      setStatus("failed");
      setConnectionError("Unable to reconnect to Codex relay after multiple attempts.");
      handlersRef.current.onConnectionError?.("Unable to reconnect. Retry manually.");
      return;
    }

    const delay = RECONNECT_BACKOFF_MS[attempt];
    reconnectAttemptRef.current = attempt + 1;
    setStatus("reconnecting");
    setConnectionError(`Reconnecting in ${Math.round(delay / 1000)}s...`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (shouldRunRef.current) {
        void (connectRef.current ? connectRef.current() : Promise.resolve());
      }
    }, delay);
  }, []);

  const useFallbackRelay = useCallback(() => {
    if (activeRelayUrlRef.current === FALLBACK_RELAY_URL) {
      return false;
    }
    fallbackAttemptedRef.current = true;
    activeRelayUrlRef.current = FALLBACK_RELAY_URL;
    return true;
  }, []);

  const sendPayload = useCallback(
    async (payload: RelayPayload) => {
      if (isWebSocketRelay(activeRelayUrlRef.current)) {
        const relay = webSocketRef.current;
        if (!relay || relay.readyState !== WebSocket.OPEN) {
          throw new Error("Relay WebSocket is not connected");
        }
        relay.send(JSON.stringify(payload));
        return;
      }

      const response = await fetch(activeRelayUrlRef.current, {
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
    [connectionId],
  );

  const flushQueuedPayloads = useCallback(async () => {
    if (!handshakeReadyRef.current) {
      return;
    }
    if (outboundQueueRef.current.length === 0) {
      return;
    }
    const queued = outboundQueueRef.current.splice(0, outboundQueueRef.current.length);
    for (const payload of queued) {
      try {
        await sendPayload(payload);
      } catch {
        outboundQueueRef.current.unshift(payload);
        return;
      }
    }
  }, [sendPayload]);

  const connect = useCallback(async () => {
    if (!shouldRunRef.current) {
      return;
    }

    handshakeReadyRef.current = false;
    clearReconnectTimer();
    closeTransports();
    setStatus((current) => (current === "idle" ? "connecting" : "reconnecting"));
    setConnectionError(null);

    const relayUrl = activeRelayUrlRef.current;
    const relayIsWs = relayUrl.startsWith("ws://") || relayUrl.startsWith("wss://");

    if (relayIsWs) {
      const socket = new WebSocket(`${relayUrl}?connectionId=${encodeURIComponent(connectionId)}`);
      webSocketRef.current = socket;

      const handleSocketFailure = () => {
        if (!shouldRunRef.current) {
          setStatus("idle");
          setConnectionError(null);
          handlersRef.current.onDisconnected?.();
          return;
        }

        handlersRef.current.onConnectionError?.("Connection to admin Codex relay lost");

        if (relayUrl.startsWith("ws://") || relayUrl.startsWith("wss://")) {
          if (!fallbackAttemptedRef.current && useFallbackRelay()) {
            setConnectionError("Primary relay unavailable. Falling back to API relay.");
            closeTransports();
            setStatus("reconnecting");
            void connectRef.current?.();
            return;
          }
        }

        scheduleReconnect();
      };

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionError(null);
      };

      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleRelayPayload(event.data);
        }
      };

      socket.onerror = () => {
        handleSocketFailure();
      };

      socket.onclose = () => {
        handleSocketFailure();
      };
      return;
    }

    const source = new EventSource(`${relayUrl}?connectionId=${encodeURIComponent(connectionId)}`);
    eventSourceRef.current = source;

    source.onopen = () => {
      reconnectAttemptRef.current = 0;
      setConnectionError(null);
      // Don't set connected yet; wait for upstream_open connection event.
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
  }, [closeTransports, clearReconnectTimer, connectionId, handleRelayPayload, scheduleReconnect, useFallbackRelay]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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

      return (await promise) as CodexClientResultByMethod[M];
    },
    [sendToRelay],
  );

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    reconnectTimerRef.current = null;
    setStatus((prev) => (prev === "idle" ? "reconnecting" : prev));
    setConnectionError(null);
    fallbackAttemptedRef.current = false;
    rejectAllPending(new Error("Reconnecting"));
    void connectRef.current?.();
  }, [clearReconnectTimer, rejectAllPending]);

  const resetConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

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

    activeRelayUrlRef.current = API_ROUTE_PATH;
    fallbackAttemptedRef.current = false;
    resetConnectionError();
    void connect();

    return () => {
      shouldRunRef.current = false;
      clearReconnectTimer();
      closeTransports();
      rejectAllPending(new Error("Codex relay disconnected"));
      setStatus("idle");
      setConnectionError(null);
    };
  }, [clearReconnectTimer, closeTransports, connect, enabled, rejectAllPending, resetConnectionError]);

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
