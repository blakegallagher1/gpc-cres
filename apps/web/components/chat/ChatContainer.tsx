'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Bell,
  Bot,
  Database,
  ListChecks,
  MessageSquare,
  Plus,
  Settings,
  SunMedium,
} from 'lucide-react';
import { AgentTrustEnvelope } from '@/types';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { AgentIndicator } from './AgentIndicator';
import { ConversationSidebar } from './ConversationSidebar';
import { DealSelector } from './DealSelector';
import { useCuaModel } from './CuaModelToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseSSEStream } from '@/lib/chat/stream';
import { sanitizeChatErrorMessage } from '@/lib/chat/errorHandling';
import { useStableOptions } from '@/lib/hooks/useStableOptions';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  type ChatMessage,
  type ConversationSummary,
  type ChatStreamEvent,
} from '@/lib/chat/types';
import {
  applyStreamingEvent,
  createStreamPresenterState,
  type StreamPresenterState,
} from '@/lib/chat/streamPresenter';
import {
  buildMapContextInput,
  useMapChatDispatch,
  useMapChatState,
} from '@/lib/chat/MapChatContext';
import { mapFeaturesFromActionPayload } from '@/lib/chat/mapFeatureUtils';
import { parseToolResultMapFeatures } from '@/lib/chat/toolResultWrapper';
import { useAgentWebSocket } from '@/lib/chat/useAgentWebSocket';

type RawConversationMessage = {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  agentName?: unknown;
  toolCalls?: unknown;
  createdAt?: unknown;
  metadata?: unknown;
};

type RawConversationResponse = {
  conversation?: {
    id?: unknown;
    title?: unknown;
    dealId?: unknown;
    messages?: RawConversationMessage[];
    updatedAt?: unknown;
    createdAt?: unknown;
  };
};

const CHAT_RECENTS_KEY = 'chat.recentConversationIds';
const MAX_RECENTS = 5;
const AUI_MESSAGE_ENHANCEMENTS = process.env.NEXT_PUBLIC_AUI_MESSAGE_ENHANCEMENTS !== 'false';
// Force REST mode — CF Worker WebSocket path has stale tool schemas that include
// query_property_db. The REST /api/chat path uses the fixed Vercel coordinator.
// Re-enable when CF Worker tool-schemas.json is regenerated and deployed.
const WS_ENABLED = false; // was: Boolean(process.env.NEXT_PUBLIC_AGENT_WS_URL)

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function normalizeConversationId(value: unknown): string | null {
  if (!isString(value) || value.length === 0) {
    return null;
  }
  return value === "agent-run" ? null : value;
}

function readRecentConversationIds(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(CHAT_RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => isString(entry));
    }
  } catch {
    return [];
  }

  return [];
}

function writeRecentConversationId(id: string): void {
  if (typeof window === 'undefined') return;

  const existing = readRecentConversationIds().filter((entry) => entry !== id);
  const next = [id, ...existing].slice(0, MAX_RECENTS);
  window.localStorage.setItem(CHAT_RECENTS_KEY, JSON.stringify(next));
}

function createRecentState(ids: string[]): string[] {
  return Array.from(new Set(ids)).slice(0, MAX_RECENTS);
}

function safeToString(value: unknown, fallback = ''): string {
  return isString(value) ? value : fallback;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function parseToolCalls(value: unknown): ChatMessage['toolCalls'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const mapped = value
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      name: isString(entry.name)
        ? entry.name
        : isString(entry.toolName)
          ? entry.toolName
          : 'tool',
      args:
        typeof entry.args === 'object' && entry.args !== null
          ? (entry.args as Record<string, unknown>)
          : undefined,
      result:
        entry.result ??
        entry.response ??
        (typeof entry.output === 'string'
          ? entry.output
          : typeof entry.output === 'object'
            ? JSON.stringify(entry.output)
            : undefined),
    }));

  return mapped.length > 0 ? mapped : [];
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((entry): entry is string => typeof entry === 'string');
  return items.length > 0 ? items : [];
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseTrustSnapshot(
  value: unknown,
  fallbackAgentName?: string,
): ChatMessage['trust'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const trust = value as Record<string, unknown>;
  const evidenceCitations = Array.isArray(trust.evidenceCitations)
    ? trust.evidenceCitations.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : undefined;

  const snapshot: ChatMessage['trust'] = {
    lastAgentName:
      typeof trust.lastAgentName === 'string' ? trust.lastAgentName : fallbackAgentName,
    confidence: parseNumber(trust.confidence),
    toolsInvoked: parseStringArray(trust.toolsInvoked),
    packVersionsUsed: parseStringArray(trust.packVersionsUsed),
    missingEvidence: parseStringArray(trust.missingEvidence),
    verificationSteps: parseStringArray(trust.verificationSteps),
    proofChecks: parseStringArray(trust.proofChecks),
    evidenceCitations,
    durationMs: parseNumber(trust.durationMs),
    errorSummary:
      typeof trust.errorSummary === 'string' || trust.errorSummary === null
        ? trust.errorSummary
        : undefined,
    toolFailures: parseStringArray(trust.toolFailures),
    retryAttempts: parseNumber(trust.retryAttempts),
    retryMaxAttempts: parseNumber(trust.retryMaxAttempts),
    retryMode: typeof trust.retryMode === 'string' ? trust.retryMode : undefined,
    fallbackLineage: parseStringArray(trust.fallbackLineage),
    fallbackReason:
      typeof trust.fallbackReason === 'string' ? trust.fallbackReason : undefined,
    runId: typeof trust.runId === 'string' ? trust.runId : undefined,
  };

  const hasContent = Object.values(snapshot).some((entry) =>
    Array.isArray(entry) ? entry.length > 0 : entry !== undefined,
  );

  return hasContent ? snapshot : undefined;
}

function toAgentTrustEnvelope(
  trust: ChatMessage['trust'],
  fallbackAgentName?: string,
): AgentTrustEnvelope | null {
  if (!trust) {
    return null;
  }

  return {
    toolsInvoked: trust.toolsInvoked ?? [],
    packVersionsUsed: trust.packVersionsUsed ?? [],
    evidenceCitations: trust.evidenceCitations ?? [],
    confidence: trust.confidence ?? 0,
    missingEvidence: trust.missingEvidence ?? [],
    verificationSteps: trust.verificationSteps ?? [],
    toolFailures: trust.toolFailures ?? [],
    proofChecks: trust.proofChecks ?? [],
    retryAttempts: trust.retryAttempts,
    retryMaxAttempts: trust.retryMaxAttempts,
    retryMode: trust.retryMode,
    fallbackLineage: trust.fallbackLineage,
    fallbackReason: trust.fallbackReason,
    lastAgentName: trust.lastAgentName ?? fallbackAgentName,
    errorSummary: trust.errorSummary ?? null,
    durationMs: trust.durationMs,
  };
}

function getLatestAgentSummary(messages: ChatMessage[]): AgentTrustEnvelope | null {
  const latestMessageWithTrust = [...messages]
    .reverse()
    .find((message) => message.trust !== undefined);

  return toAgentTrustEnvelope(
    latestMessageWithTrust?.trust,
    latestMessageWithTrust?.agentName,
  );
}

function toChatMessageFromApi(msg: RawConversationMessage): ChatMessage {
  const metadata = parseMetadata(msg.metadata);
  const mapFeatures = Array.isArray(metadata?.mapFeatures)
    ? (metadata?.mapFeatures as ChatMessage['mapFeatures'])
    : undefined;
  const agentName = isString(msg.agentName) ? msg.agentName : undefined;
  const trust = parseTrustSnapshot(metadata?.trust, agentName);

  return {
    id: normalizeConversationId(msg.id) ?? crypto.randomUUID(),
    role: isString(msg.role) ? (msg.role as ChatMessage['role']) : 'assistant',
    content: safeToString(msg.content, ''),
    agentName,
    toolCalls: parseToolCalls(msg.toolCalls),
    createdAt: normalizeConversationId(msg.createdAt) ?? new Date().toISOString(),
    metadata,
    trust,
    mapFeatures,
  };
}

/**
 * Primary authenticated chat workspace with conversation history and run-state context.
 */
export function ChatContainer() {
  const mapState = useMapChatState();
  const mapDispatch = useMapChatDispatch();
  const isMobile = useIsMobile();
  const [cuaModel, setCuaModel] = useCuaModel();
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedDealStatus, setSelectedDealStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [transportSessionId, setTransportSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentTrustEnvelope | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [authToken, setAuthToken] = useState<string | null>(null);

  const [presenterState, setPresenterState] = useState<StreamPresenterState>(
    createStreamPresenterState(),
  );
  const presenterRef = useRef<StreamPresenterState>(createStreamPresenterState());
  const [recentConversationIds, setRecentConversationIds] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const transportSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    presenterRef.current = presenterState;
  }, [presenterState]);

  // Fetch deal status when a deal is selected
  useEffect(() => {
    const dealId = selectedDealId;
    if (!dealId) {
      setSelectedDealStatus(null);
      return;
    }
    let cancelled = false;
    async function fetchDealStatus(dealIdValue: string) {
      try {
        const res = await fetch(`/api/deals/${encodeURIComponent(dealIdValue)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { deal?: { status?: string } };
        if (!cancelled && body.deal?.status) {
          setSelectedDealStatus(body.deal.status);
        }
      } catch {
        // Non-critical — deal prompts will fall back to defaults
      }
    }
    void fetchDealStatus(dealId);
    return () => { cancelled = true; };
  }, [selectedDealId]);

  // Fetch NextAuth JWT for chat transport auth.
  // In REST mode this is sent as Bearer token to avoid cookie-only auth failures.
  useEffect(() => {
    let cancelled = false;
    const fetchToken = async () => {
      try {
        const res = await fetch('/api/auth/token');
        if (!res.ok) return;
        const body = (await res.json()) as { token?: string };
        if (!cancelled && body.token) {
          setAuthToken(body.token);
        }
      } catch {
        // Token fetch failed — WebSocket will connect once token is available
      }
    };
    fetchToken();
    return () => { cancelled = true; };
  }, []);

  const setTransportSessionState = useCallback((id: string | null) => {
    transportSessionIdRef.current = id;
    setTransportSessionId(id);
  }, []);

  // Eagerly generate a transport-only session id for WebSocket mode so the
  // socket connects before the first send, without leaking the draft id into
  // persisted conversation state or the URL.
  useEffect(() => {
    if (!WS_ENABLED || transportSessionIdRef.current) {
      return;
    }

    const initialConversationId =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('conversationId');

    if (!initialConversationId) {
      setTransportSessionState(crypto.randomUUID());
    }
  }, [setTransportSessionState]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRecentConversationIds(createRecentState(readRecentConversationIds()));
    }
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsHistoryOpen(true);
    }
  }, [isMobile]);

  const hasRecentConversations = useMemo(
    () => recentConversationIds.length > 0,
    [recentConversationIds],
  );

  const messageSectionTitle = useMemo(
    () =>
      hasRecentConversations
        ? `${recentConversationIds.length} saved runs`
        : 'No saved runs yet',
    [hasRecentConversations, recentConversationIds.length],
  );
  const activeAgentLabel = currentAgent ?? agentSummary?.lastAgentName ?? 'Coordinator';
  const threadStatusLabel = conversationId ? 'Saved thread' : 'Draft thread';
  const transportLabel = WS_ENABLED ? 'Live socket' : 'HTTP stream';
  const scopeLabel = selectedDealId ? 'Deal-linked' : 'No deal scope';

  const syncRecent = useCallback((id: string) => {
    writeRecentConversationId(id);
    setRecentConversationIds((current) =>
      createRecentState([id, ...current.filter((value) => value !== id)]),
    );
  }, []);

  const setConversationState = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);

    if (typeof window !== 'undefined') {
      const target = new URL(window.location.href);
      if (id) {
        target.searchParams.set('conversationId', id);
      } else {
        target.searchParams.delete('conversationId');
      }
      window.history.replaceState({}, '', target.toString());
    }
  }, []);

  const handleConversationDeleted = useCallback(
    (deletedId: string) => {
      setConversations((prev) => prev.filter((conv) => conv.id !== deletedId));
      setRecentConversationIds((prev) =>
        createRecentState(prev.filter((id) => id !== deletedId)),
      );
      // If the deleted conversation was active, clear it
      if (conversationId === deletedId) {
        setConversationState(null);
      }
    },
    [conversationId, setConversationState],
  );

  const handleConversationRenamed = useCallback(
    (renamedId: string, newTitle: string) => {
      setConversations((prev) =>
        prev.map((conv) => (conv.id === renamedId ? { ...conv, title: newTitle } : conv)),
      );
    },
    [],
  );

  const reloadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const response = await fetch('/api/chat/conversations');
      if (!response.ok) {
        setConversations([]);
        return;
      }

      const payload = (await response.json()) as {
        conversations?: ConversationSummary[];
      };
      const list = payload.conversations ?? [];
      setConversations(list);
      setRecentConversationIds((current) =>
        createRecentState(current.filter((entry) => list.some((conv) => conv.id === entry))),
      );
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    void reloadConversations();
  }, [reloadConversations]);

  const loadConversation = useCallback(
    async (id: string | null) => {
      const normalizedRequestedId = normalizeConversationId(id);
      if (!normalizedRequestedId) {
        setConversationState(null);
        setTransportSessionState(WS_ENABLED ? crypto.randomUUID() : null);
        setCurrentAgent(null);
        setAgentSummary(null);
        const reset = createStreamPresenterState();
        presenterRef.current = reset;
        setPresenterState(reset);
        setMessages([]);
        mapDispatch({ type: 'SET_REFERENCED_FEATURES', features: [] });
        return;
      }

      setConversationState(normalizedRequestedId);
      setTransportSessionState(normalizedRequestedId);
      setCurrentAgent(null);
      setAgentSummary(null);

      const resetState = createStreamPresenterState();
      resetState.conversationId = normalizedRequestedId;
      presenterRef.current = resetState;
      setPresenterState(resetState);
      setMessages([]);

      try {
        const response = await fetch(`/api/chat/conversations/${normalizedRequestedId}`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as RawConversationResponse;
        const convo = payload.conversation;
        if (!convo) {
          return;
        }

        const rawMessages = Array.isArray(convo.messages) ? convo.messages : [];
        const loaded = rawMessages
          .map((entry) => toChatMessageFromApi(entry))
          .filter((msg) => msg.content.length > 0 || msg.role === 'assistant');

        const latestMapFeatures =
          [...loaded]
            .reverse()
            .find((msg) => Array.isArray(msg.mapFeatures) && msg.mapFeatures.length > 0)
            ?.mapFeatures ?? [];
        mapDispatch({
          type: 'SET_REFERENCED_FEATURES',
          features: latestMapFeatures,
        });

        const normalizedId = normalizeConversationId(convo.id);
        if (normalizedId) {
          setConversationState(normalizedId);
          syncRecent(normalizedId);
          setSelectedDealId(normalizeConversationId(convo.dealId));
        }

        setAgentSummary(getLatestAgentSummary(loaded));
        setMessages(loaded);
      } finally {
        void reloadConversations();
      }
    },
    [
      mapDispatch,
      reloadConversations,
      setConversationState,
      setTransportSessionState,
      syncRecent,
    ],
  );

  useEffect(() => {
    const initialConversationId = new URLSearchParams(window.location.search).get(
      'conversationId',
    );
    if (initialConversationId) {
      void loadConversation(initialConversationId);
    }
  }, [loadConversation]);

  const applyEvent = useCallback(
    (event: ChatStreamEvent) => {
      const now = new Date().toISOString();

      setMessages((current) => {
        const { nextState, nextMessages } = applyStreamingEvent(
          presenterRef.current,
          current,
          event,
          now,
          () => `${event.type}-${Date.now()}-${++eventCounterRef.current}`,
        );

        presenterRef.current = nextState;
        setPresenterState(nextState);
        return nextMessages;
      });

      if (event.type === 'agent_summary') {
        const summary = event.trust as AgentTrustEnvelope;
        setAgentSummary(summary);
      }

      if (event.type === 'map_action') {
        mapDispatch({ type: 'MAP_ACTION_RECEIVED', payload: event.payload });
        const features = mapFeaturesFromActionPayload(event.payload);
        if (features.length > 0) {
          mapDispatch({ type: 'ADD_REFERENCED_FEATURES', features });
        }
      }

      if (
        (event.type === 'tool_end' || event.type === 'tool_result') &&
        event.result !== undefined
      ) {
        const features = parseToolResultMapFeatures(event.result);
        if (features?.length) {
          mapDispatch({ type: 'ADD_REFERENCED_FEATURES', features });
        }
      }

      if (
        (event.type === 'tool_end' || event.type === 'tool_result') &&
        event.name === 'store_memory'
      ) {
        window.dispatchEvent(new CustomEvent('gpc:memory-updated', { detail: { timestamp: Date.now() } }));
      }

      if (event.type === 'agent_switch') {
        setCurrentAgent(event.agentName);
      } else if (event.type === 'handoff') {
        setCurrentAgent(event.toAgent ?? event.to);
      } else if (event.type === 'agent_progress' && event.lastAgentName) {
        setCurrentAgent(event.lastAgentName);
      }

      if (event.type === 'done') {
        setIsStreaming(false);
        setCurrentAgent(null);
        const nextConversationId = normalizeConversationId(event.conversationId);
        const isDraftSessionEcho =
          nextConversationId !== null &&
          conversationIdRef.current === null &&
          transportSessionIdRef.current === nextConversationId;

        if (nextConversationId && !isDraftSessionEcho) {
          syncRecent(nextConversationId);
          if (conversationIdRef.current !== nextConversationId) {
            setConversationState(nextConversationId);
          }
          void reloadConversations();
        }
      }
    },
    [mapDispatch, reloadConversations, setConversationState, syncRecent],
  );

  // WebSocket transport (Cloudflare Agent Worker)
  const { sendMessage: wsSendMessage } = useAgentWebSocket({
    token: authToken,
    sessionId: transportSessionId,
    onEvent: applyEvent,
    enabled: WS_ENABLED,
  });

  const handleSend = useCallback(
    async (content: string, files?: File[]) => {
      const text = content.trim();
      if (!text && (!files || files.length === 0)) return;

      // Upload files to deal if selected, or extract content client-side
      let fileContext = '';
      if (files && files.length > 0) {
        const uploaded: { filename: string; contentType: string; id?: string; contentPreview?: string }[] = [];
        const { extractFileContent, canExtractFileContent } = await import('@/lib/chat/fileContentExtractor');

        try {
          for (const file of files) {
            if (selectedDealId) {
              // Deal-specific upload path (persists to B2 storage)
              const formData = new FormData();
              formData.append('file', file);
              formData.append('kind', 'other');

              const res = await fetch(`/api/deals/${selectedDealId}/uploads`, {
                method: 'POST',
                body: formData,
              });

              if (!res.ok) {
                throw new Error(`Failed to upload ${file.name}`);
              }

              const data = (await res.json()) as {
                upload: { id: string; filename: string; contentType: string };
              };

              const uploadedFile: typeof uploaded[number] = {
                filename: data.upload.filename,
                contentType: data.upload.contentType,
                id: data.upload.id,
              };

              if (canExtractFileContent(file)) {
                const content = await extractFileContent(file);
                if (content) uploadedFile.contentPreview = content;
              }

              uploaded.push(uploadedFile);
            } else {
              // No deal selected — extract content client-side only (no server upload)
              const uploadedFile: typeof uploaded[number] = {
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
              };

              if (canExtractFileContent(file)) {
                const content = await extractFileContent(file);
                if (content) uploadedFile.contentPreview = content;
              }

              uploaded.push(uploadedFile);
            }
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Upload failed';
          const sanitized = sanitizeChatErrorMessage(`Error uploading files: ${rawMsg}`);
          setMessages((current) =>
            current.concat([
              {
                id: crypto.randomUUID(),
                role: 'system',
                content: sanitized.message,
                createdAt: new Date().toISOString(),
                eventKind: 'error',
                metadata: sanitized.correlationId ? { correlationId: sanitized.correlationId } : undefined,
              },
            ]),
          );
          return;
        }

        // Build context including file content when available
        const fileContextParts: string[] = [];
        fileContextParts.push(
          `[Attached ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}]`
        );

        for (const f of uploaded) {
          fileContextParts.push(`[File: ${f.filename} (${f.contentType})]`);
          if (f.contentPreview) {
            fileContextParts.push(`[Content]:\n${f.contentPreview}\n[End]`);
          }
        }

        fileContext = fileContextParts.join('\n') + '\n';
      }

      const messageForAgent = fileContext + (text || 'Please review the attached files.');
      const displayText = text || `Uploaded ${files?.length ?? 0} file${(files?.length ?? 0) > 1 ? 's' : ''}`;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: displayText,
        createdAt: new Date().toISOString(),
      };

      const resetState = createStreamPresenterState();
      resetState.conversationId = conversationIdRef.current;
      presenterRef.current = resetState;
      setPresenterState(resetState);
      setCurrentAgent(null);
      setAgentSummary(null);
      setIsStreaming(true);
      mapDispatch({ type: 'SET_REFERENCED_FEATURES', features: [] });
      setMessages((current) => [...current, userMessage]);

      const requestMapContext = buildMapContextInput(mapState);

      // WebSocket transport — send and return (events arrive via onEvent callback)
      if (WS_ENABLED) {
        wsSendMessage(messageForAgent, selectedDealId ?? undefined, requestMapContext ?? null);
        return;
      }

      // SSE transport (fallback)
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            message: messageForAgent,
            conversationId: conversationIdRef.current,
            dealId: selectedDealId,
            mapContext: requestMapContext,
            cuaModel,
          }),
        });

        if (!response.ok) {
          const body = (await response
            .json()
            .catch(() => ({ error: 'Request failed' }))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }

        for await (const event of parseSSEStream(response)) {
          applyEvent(event);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        const rawMsg = error instanceof Error ? error.message : 'Something went wrong.';
        const sanitized = sanitizeChatErrorMessage(rawMsg);
        setMessages((current) =>
          current.concat([
            {
              id: crypto.randomUUID(),
              role: 'system',
              content: sanitized.message,
              createdAt: new Date().toISOString(),
              eventKind: 'error',
              metadata: sanitized.correlationId ? { correlationId: sanitized.correlationId } : undefined,
            },
          ]),
        );
        setIsStreaming(false);
        setCurrentAgent(null);
      } finally {
        setIsStreaming(false);
        setCurrentAgent(null);
      }
    },
    [applyEvent, authToken, cuaModel, mapDispatch, mapState, selectedDealId, wsSendMessage],
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setCurrentAgent(null);
  }, []);

  const handleRetry = useCallback(() => {
    // Find the last user message and resend it
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      void handleSend(lastUserMessage.content);
    }
  }, [messages, handleSend]);

  const handleToolApprovalEvents = useCallback(
    (events: ChatStreamEvent[]) => {
      for (const event of events) {
        applyEvent(event);
      }
    },
    [applyEvent],
  );

  useEffect(() => {
    const reloadHandler = () => {
      const conversationRouteId =
        typeof window === 'undefined'
          ? null
          : new URLSearchParams(window.location.search).get('conversationId');
      if (conversationRouteId) {
        void loadConversation(conversationRouteId);
      }
    };

    window.addEventListener('chat:reopen-conversation', reloadHandler);
    return () => {
      window.removeEventListener('chat:reopen-conversation', reloadHandler);
    };
  }, [loadConversation]);

  const visibleMessages = messages;
  const stableChatInputOptions = useStableOptions({
    onSend: handleSend,
    onStop: handleStop,
  });
  const stableMessageListOptions = useStableOptions({
    onSuggestionClick: handleSend,
  });
  const showLaunchComposer = visibleMessages.length === 0;
  const showHistoryRail = !isMobile || conversationId !== null || visibleMessages.length > 0;
  const desktopHistoryOpen = isMobile ? isHistoryOpen : true;
  const handleQuickActionSelect = useCallback((prompt: string) => {
    void handleSend(prompt);
  }, [handleSend]);
  const shellNavItems = [
    { href: '/chat', label: 'Chat', icon: MessageSquare, active: true },
    { href: '/runs', label: 'Runs', icon: ListChecks, active: false },
    { href: '/reference', label: 'Sources', icon: Database, active: false },
    { href: '/workflows', label: 'Tasks', icon: ListChecks, active: false },
    { href: '/command-center', label: 'Analytics', icon: BarChart3, active: false },
    { href: '/settings', label: 'Settings', icon: Settings, active: false },
  ] as const;
  const statCards = [
    { label: 'Active deals', value: selectedDealId ? '1' : '0' },
    { label: 'Tracked parcels', value: selectedDealId ? '1' : '0' },
    { label: 'Pipeline stage', value: selectedDealStatus ?? '—' },
    { label: 'Open tasks', value: isStreaming ? '1' : '—' },
  ] as const;
  const stageChips = [
    { label: 'Files', prompt: 'Use the current files in the workspace as the primary source set before answering.' },
    { label: 'Sources', prompt: 'Use the strongest verified sources and keep citations attached to the response.' },
    { label: 'Prompt library', prompt: 'Show the strongest prompt pattern for this task, then run it against the current scope.' },
  ] as const;
  const chatInput = (
    <ChatInput
      onSend={stableChatInputOptions.onSend}
      isStreaming={isStreaming}
      onStop={stableChatInputOptions.onStop}
      canAttachFiles={true}
      placeholder="Ask anything. Type @ to add sources."
      helperText="Lead with the matter, outcome, or constraint. Enter sends. Shift+Enter adds a line."
      submitLabel="Start run"
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--app-header-height))] min-h-[calc(100svh-var(--app-header-height))] overflow-hidden bg-[#0b0c0f] text-white">
      <aside className="hidden w-[92px] shrink-0 flex-col border-r border-white/8 bg-[#101113] px-2.5 py-4 xl:flex">
        <div className="mb-3 flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-white/90">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          {shellNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] transition-colors',
                  item.active
                    ? 'bg-white/[0.06] text-white'
                    : 'text-white/62 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-auto flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] py-3 text-lg font-semibold text-white/90">
          G
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/8 bg-[#121314] px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-[14px] text-white/88 md:flex">
              <span className="font-medium">Gallagher Property Company</span>
            </div>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-white">Chat</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-2xl border-white/10 bg-white/[0.03] text-white/72 hover:bg-white/[0.08] hover:text-white"
            >
              <SunMedium className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-2xl border-white/10 bg-white/[0.03] text-white/72 hover:bg-white/[0.08] hover:text-white"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              className="h-12 rounded-2xl bg-white px-5 text-[1rem] font-medium text-black hover:bg-white/92"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setIsHistoryOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New run
            </Button>
          </div>
        </header>

        <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden border-t border-white/4">
          <div className="flex h-full min-h-0 min-w-0">
            {showHistoryRail ? (
              <ConversationSidebar
                conversations={conversations}
                activeConversationId={conversationId}
                onConversationSelect={loadConversation}
                open={desktopHistoryOpen}
                onToggle={() => setIsHistoryOpen((current) => !current)}
                onRefresh={reloadConversations}
                loading={isLoadingConversations}
                hasRecentRecents={hasRecentConversations}
                recentConversationIds={recentConversationIds}
                mobile={isMobile}
                showCollapsedTrigger={!isMobile || conversationId !== null || visibleMessages.length > 0}
                onConversationDeleted={handleConversationDeleted}
                onConversationRenamed={handleConversationRenamed}
              />
            ) : null}

            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#111214]">
              <div className="flex items-center justify-center border-b border-white/8 px-6 py-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[14px] text-white/78">
                  <Bot className="h-4 w-4" />
                  GPT-5.4
                </div>
              </div>

              {showLaunchComposer ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="border-b border-white/8 px-6 py-5">
                      <div className="grid gap-4 lg:grid-cols-4">
                        {statCards.map((card) => (
                          <div
                            key={card.label}
                            className="rounded-[22px] border border-white/8 bg-white/[0.035] px-5 py-5"
                          >
                            <p className="text-[14px] text-white/55">{card.label}</p>
                            <p className="mt-2 text-[2.1rem] font-semibold tracking-[-0.05em] text-white">
                              {card.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="px-6 py-6">
                      <div className="mb-8 flex items-center gap-4 border-b border-white/8 pb-6">
                        <span className="text-[15px] text-white/68">Client matter</span>
                        <div className="min-w-[240px] max-w-[360px] flex-1">
                          <DealSelector
                            selectedDealId={selectedDealId}
                            onSelect={setSelectedDealId}
                          />
                        </div>
                      </div>

                      <div className="mx-auto flex max-w-[980px] min-h-[420px] flex-col items-center justify-center text-center">
                        <h2 className="text-[4rem] font-semibold tracking-[-0.08em] text-white">
                          Ask anything.
                        </h2>
                        <p className="mt-5 max-w-[820px] text-[18px] leading-9 text-white/46">
                          Name the matter, decision, memo, table, or next move you need back.
                          <br />
                          Use @ only when you want to pin the run to a specific source set.
                        </p>
                        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                          {stageChips.map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => handleQuickActionSelect(chip.prompt)}
                              className="rounded-full border border-white/10 bg-transparent px-8 py-4 text-[16px] text-white/78 transition-colors hover:bg-white/[0.05] hover:text-white"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {currentAgent ? (
                      <div className="px-4 pb-2 sm:px-5">
                        <AgentIndicator agentName={currentAgent} />
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-white/8 px-6 py-5">{chatInput}</div>
                </>
              ) : (
                <>
                  <div className="border-b border-white/8 px-6 py-5">
                    <div className="grid gap-4 lg:grid-cols-4">
                      {statCards.map((card) => (
                        <div
                          key={card.label}
                          className="rounded-[22px] border border-white/8 bg-white/[0.035] px-5 py-5"
                        >
                          <p className="text-[14px] text-white/55">{card.label}</p>
                          <p className="mt-2 text-[2.1rem] font-semibold tracking-[-0.05em] text-white">
                            {card.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 flex items-center gap-4">
                      <span className="text-[15px] text-white/68">Client matter</span>
                      <div className="min-w-[240px] max-w-[360px] flex-1">
                        <DealSelector
                          selectedDealId={selectedDealId}
                          onSelect={setSelectedDealId}
                        />
                      </div>
                    </div>
                  </div>

                  {currentAgent ? (
                    <div className="px-4 pb-2 sm:px-5">
                      <AgentIndicator agentName={currentAgent} />
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-hidden">
                    <MessageList
                      messages={visibleMessages}
                      isStreaming={isStreaming}
                      conversationId={conversationId}
                      onSuggestionClick={stableMessageListOptions.onSuggestionClick}
                      onToolApprovalEvents={handleToolApprovalEvents}
                      onRetry={handleRetry}
                      emptyState={{
                        eyebrow: 'Verified run workspace',
                        title: 'Ask the matter. Keep the proof attached.',
                        description:
                          'Start from the client matter, source stack, or operating question, then name the memo, checklist, comparison, or next move you need back.',
                        suggestions: [
                          'Draft a zoning memo for this site',
                          'Review the evidence and missing source gaps',
                          'Build the diligence checklist for the matter',
                          'Compare the two entitlement paths',
                        ],
                        detailHeading: 'What the workspace returns',
                        detailItems: [
                          {
                            label: 'Draft',
                            title: 'A usable document or table',
                            detail: 'The response should land as a memo, checklist, table, or action path that can move directly into review.',
                          },
                          {
                            label: 'Proof',
                            title: 'Attached sources and verification',
                            detail: 'Evidence citations, proof checks, and missing support stay visible in the inspector while the run unfolds.',
                          },
                          {
                            label: 'Handoff',
                            title: 'Specialists without context loss',
                            detail: 'Research, diligence, and entitlement specialists can step in without breaking the thread or its evidence trail.',
                          },
                        ],
                      }}
                    />
                  </div>

                  <div className="border-t border-white/8 px-6 py-5">{chatInput}</div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
