'use client';

import type { MapContextInput } from '@entitlement-os/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatStreamEvent } from '@/lib/chat/streamEventTypes';

const AGENT_WS_URL =
  process.env.NEXT_PUBLIC_AGENT_WS_URL ?? 'wss://agents.gallagherpropco.com';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseAgentWebSocketOptions {
  /** NextAuth JWT for WebSocket authentication */
  token: string | null;
  /** Transport session id used to key the Worker connection */
  sessionId: string | null;
  /** Called for every streaming event from the Worker */
  onEvent: (event: ChatStreamEvent) => void;
  /** Whether WebSocket transport is enabled (vs SSE fallback) */
  enabled?: boolean;
}

interface Operation {
  id: string;
  label: string;
  pct: number;
  status: 'progress' | 'done' | 'error';
  summary?: string;
  error?: string;
}

interface UseAgentWebSocketReturn {
  /** Send a user message over WebSocket */
  sendMessage: (
    text: string,
    dealId?: string,
    mapContext?: MapContextInput | null,
  ) => void;
  /** Connection status */
  status: ConnectionStatus;
  /** Disconnect and clean up */
  disconnect: () => void;
  /** Active operations */
  operations: Map<string, Operation>;
}

/**
 * Browser WebSocket hook for connecting to the Cloudflare Agent Worker.
 *
 * Events received from the Worker match the existing ChatStreamEvent types
 * defined in streamEventTypes.ts, so the existing streamPresenter and
 * ChatContainer applyEvent logic work unchanged.
 *
 * Usage:
 *   const { sendMessage, status } = useAgentWebSocket({
 *     token: nextAuthJwt,
 *     sessionId,
 *     onEvent: applyEvent,
 *     enabled: true,
 *   });
 */
export function useAgentWebSocket({
  token,
  sessionId,
  onEvent,
  enabled = false,
}: UseAgentWebSocketOptions): UseAgentWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [operations, setOperations] = useState<Map<string, Operation>>(new Map());
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationsRef = useRef<Map<string, Operation>>(new Map());
  const manualDisconnectRef = useRef(false);

  // Keep callback ref fresh without re-triggering connection
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.close(1000);
    }
    setStatus('disconnected');
  }, []);

  // Connect / reconnect when enabled + token + sessionId are set.
  useEffect(() => {
    if (!enabled || !token || !sessionId) {
      disconnect();
      return;
    }

    manualDisconnectRef.current = false;

    // Don't reconnect if already connected to the same transport session.
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus('connecting');

    const url = new URL('/ws', AGENT_WS_URL);
    url.searchParams.set('token', token);
    // The Worker still expects its transport key under the conversationId param.
    url.searchParams.set('conversationId', sessionId);

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;
    let cleanedUp = false;

    ws.onopen = () => {
      if (cleanedUp) {
        return;
      }
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle operation events
        if (data.type === 'operation_progress') {
          const op: Operation = {
            id: data.operationId,
            label: data.label,
            pct: data.pct,
            status: 'progress',
          };
          operationsRef.current.set(data.operationId, op);
          setOperations(new Map(operationsRef.current));
          onEventRef.current(data);
          return;
        }

        if (data.type === 'operation_done') {
          const op: Operation = {
            id: data.operationId,
            label: data.label,
            pct: 100,
            status: 'done',
            summary: data.summary,
          };
          operationsRef.current.set(data.operationId, op);
          setOperations(new Map(operationsRef.current));
          onEventRef.current(data);
          return;
        }

        if (data.type === 'operation_error') {
          const op: Operation = {
            id: data.operationId,
            label: data.label,
            pct: 0,
            status: 'error',
            error: data.error,
          };
          operationsRef.current.set(data.operationId, op);
          setOperations(new Map(operationsRef.current));
          onEventRef.current(data);
          return;
        }

        // Regular chat events
        onEventRef.current(data as ChatStreamEvent);
      } catch {
        // Non-JSON message — ignore (could be a ping/pong)
      }
    };

    ws.onerror = () => {
      if (cleanedUp) {
        return;
      }
      setStatus('error');
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      if (cleanedUp || manualDisconnectRef.current) {
        setStatus('disconnected');
        return;
      }

      // Normal closure or auth rejection — don't reconnect.
      if (event.code === 1000 || event.code === 4001 || event.code === 4003) {
        setStatus('disconnected');
        if (event.code === 4001 || event.code === 4003) {
          onEventRef.current({
            type: 'error',
            message: 'Authentication failed. Please refresh the page.',
          });
        }
        return;
      }

      // Abnormal closure — attempt one reconnect after 2s.
      setStatus('error');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (manualDisconnectRef.current) {
          return;
        }
        setReconnectNonce((current) => current + 1);
      }, 2000);
    };

    return () => {
      cleanedUp = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      ws.close(1000);
    };
  }, [enabled, token, sessionId, disconnect, reconnectNonce]);

  const sendMessage = useCallback(
    (
      text: string,
      dealId?: string,
      mapContext?: MapContextInput | null,
    ) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        onEventRef.current({
          type: 'error',
          message: 'Not connected to agent. Please wait or refresh.',
        });
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'message',
          text,
          ...(dealId ? { dealId } : {}),
          ...(mapContext ? { mapContext } : {}),
        }),
      );
    },
    [],
  );

  return { sendMessage, status, disconnect, operations };
}
