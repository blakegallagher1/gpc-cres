'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatStreamEvent } from '@/lib/chat/streamEventTypes';

const AGENT_WS_URL =
  process.env.NEXT_PUBLIC_AGENT_WS_URL ?? 'wss://agents.gallagherpropco.com';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseAgentWebSocketOptions {
  /** Supabase access token (JWT) */
  token: string | null;
  /** Current conversation ID (null = new conversation) */
  conversationId: string | null;
  /** Called for every streaming event from the Worker */
  onEvent: (event: ChatStreamEvent) => void;
  /** Whether WebSocket transport is enabled (vs SSE fallback) */
  enabled?: boolean;
}

interface UseAgentWebSocketReturn {
  /** Send a user message over WebSocket */
  sendMessage: (text: string, dealId?: string) => void;
  /** Connection status */
  status: ConnectionStatus;
  /** Disconnect and clean up */
  disconnect: () => void;
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
 *     token: supabaseAccessToken,
 *     conversationId,
 *     onEvent: applyEvent,
 *     enabled: true,
 *   });
 */
export function useAgentWebSocket({
  token,
  conversationId,
  onEvent,
  enabled = false,
}: UseAgentWebSocketOptions): UseAgentWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback ref fresh without re-triggering connection
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // Connect / reconnect when enabled + token + conversationId are set
  useEffect(() => {
    if (!enabled || !token || !conversationId) {
      disconnect();
      return;
    }

    // Don't reconnect if already connected to the same conversation
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    const url = new URL('/ws', AGENT_WS_URL);
    url.searchParams.set('token', token);
    url.searchParams.set('conversationId', conversationId);

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChatStreamEvent;
        onEventRef.current(data);
      } catch {
        // Non-JSON message — ignore (could be a ping/pong)
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = (event) => {
      wsRef.current = null;

      // Normal closure or auth rejection — don't reconnect
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

      // Abnormal closure — attempt one reconnect after 2s
      setStatus('error');
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        // Re-trigger effect by toggling state (the effect deps will handle it)
        setStatus('disconnected');
      }, 2000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, token, conversationId, disconnect]);

  const sendMessage = useCallback(
    (text: string, dealId?: string) => {
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
        }),
      );
    },
    [],
  );

  return { sendMessage, status, disconnect };
}
