'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AgentTrustEnvelope } from '@/types';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { AgentIndicator } from './AgentIndicator';
import { DealSelector } from './DealSelector';
import {
  ChatWorkspaceHero,
} from './ChatWorkspacePanels';
import { useCuaModel } from './CuaModelToggle';
import { parseSSEStream } from '@/lib/chat/stream';
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
  return isString(value) && value.length > 0 ? value : null;
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
    if (!selectedDealId) {
      setSelectedDealStatus(null);
      return;
    }
    const dealId = selectedDealId;
    let cancelled = false;
    async function fetchDealStatus() {
      try {
        const res = await fetch(`/api/deals/${encodeURIComponent(dealId)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { deal?: { status?: string } };
        if (!cancelled && body.deal?.status) {
          setSelectedDealStatus(body.deal.status);
        }
      } catch {
        // Non-critical — deal prompts will fall back to defaults
      }
    }
    void fetchDealStatus();
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
      if (!id) {
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

      setConversationState(id);
      setTransportSessionState(id);
      setCurrentAgent(null);
      setAgentSummary(null);

      const resetState = createStreamPresenterState();
      resetState.conversationId = id;
      presenterRef.current = resetState;
      setPresenterState(resetState);
      setMessages([]);

      try {
        const response = await fetch(`/api/chat/conversations/${id}`);
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
          setMessages((current) =>
            current.concat([
              {
                id: crypto.randomUUID(),
                role: 'system',
                content: `Error uploading files: ${err instanceof Error ? err.message : 'Upload failed'}`,
                createdAt: new Date().toISOString(),
                eventKind: 'error',
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

        const message = error instanceof Error ? error.message : 'Something went wrong.';
        setMessages((current) =>
          current.concat([
            {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Error: ${message}`,
              createdAt: new Date().toISOString(),
              eventKind: 'error',
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
  const handleQuickActionSelect = useCallback((prompt: string) => {
    void handleSend(prompt);
  }, [handleSend]);
  const chatInput = (
    <ChatInput
      onSend={stableChatInputOptions.onSend}
      isStreaming={isStreaming}
      onStop={stableChatInputOptions.onStop}
      canAttachFiles={true}
      placeholder="Ask Harvey anything. Type @ to add sources."
      helperText="Lead with the matter, outcome, or constraint. Enter sends. Shift+Enter adds a line."
      submitLabel="Start run"
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--app-header-height))] min-h-[calc(100svh-var(--app-header-height))] overflow-hidden bg-background">
      <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-3 py-4 md:px-6 md:py-6">
        <section className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              {showLaunchComposer ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <ChatWorkspaceHero
                      activeAgentLabel={activeAgentLabel}
                      conversationCount={conversations.length}
                      cuaModel={cuaModel}
                      dealSelector={(
                        <DealSelector
                          selectedDealId={selectedDealId}
                          onSelect={setSelectedDealId}
                        />
                      )}
                      dealStatus={selectedDealStatus}
                      launchState
                      scopeLabel={scopeLabel}
                      threadStatusLabel={threadStatusLabel}
                      transportLabel={transportLabel}
                      isMobile={isMobile}
                      onOpenHistory={() => undefined}
                      onOpenInspector={() => undefined}
                      onCuaModelChange={setCuaModel}
                      onQuickActionSelect={handleQuickActionSelect}
                    />

                    {currentAgent ? (
                      <div className="px-4 pb-2 sm:px-5">
                        <AgentIndicator agentName={currentAgent} />
                      </div>
                    ) : null}
                  </div>

                  {chatInput}
                </>
              ) : (
                <>
                  <ChatWorkspaceHero
                    activeAgentLabel={activeAgentLabel}
                    conversationCount={conversations.length}
                    cuaModel={cuaModel}
                    dealSelector={(
                      <DealSelector
                        selectedDealId={selectedDealId}
                        onSelect={setSelectedDealId}
                      />
                    )}
                    dealStatus={selectedDealStatus}
                    launchState={false}
                    scopeLabel={scopeLabel}
                    threadStatusLabel={threadStatusLabel}
                    transportLabel={transportLabel}
                    isMobile={isMobile}
                    onOpenHistory={() => undefined}
                    onOpenInspector={() => undefined}
                    onCuaModelChange={setCuaModel}
                    onQuickActionSelect={handleQuickActionSelect}
                  />

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

                  {chatInput}
                </>
              )}
            </div>
          </section>
      </div>
    </div>
  );
}
