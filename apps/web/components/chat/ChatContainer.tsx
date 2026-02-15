'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AgentStatePanel } from '@/components/agent-state/AgentStatePanel';
import { AgentTrustEnvelope } from '@/types';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentIndicator } from './AgentIndicator';
import { DealSelector } from './DealSelector';
import { parseSSEStream } from '@/lib/chat/stream';
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

function toChatMessageFromApi(msg: RawConversationMessage): ChatMessage {
  return {
    id: normalizeConversationId(msg.id) ?? crypto.randomUUID(),
    role: isString(msg.role) ? (msg.role as ChatMessage['role']) : 'assistant',
    content: safeToString(msg.content, ''),
    agentName: isString(msg.agentName) ? msg.agentName : undefined,
    toolCalls: parseToolCalls(msg.toolCalls),
    createdAt: normalizeConversationId(msg.createdAt) ?? new Date().toISOString(),
    metadata: parseMetadata(msg.metadata),
  };
}

export function ChatContainer() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [agentSummary, setAgentSummary] = useState<AgentTrustEnvelope | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  const [presenterState, setPresenterState] = useState<StreamPresenterState>(
    createStreamPresenterState(),
  );
  const presenterRef = useRef<StreamPresenterState>(createStreamPresenterState());
  const [recentConversationIds, setRecentConversationIds] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    presenterRef.current = presenterState;
  }, [presenterState]);

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
        ? `${recentConversationIds.length} recent chats`
        : 'No recents yet',
    [hasRecentConversations, recentConversationIds.length],
  );

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
        setCurrentAgent(null);
        setAgentSummary(null);
        const reset = createStreamPresenterState();
        presenterRef.current = reset;
        setPresenterState(reset);
        setMessages([]);
        return;
      }

      setConversationState(id);
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

        const normalizedId = normalizeConversationId(convo.id);
        if (normalizedId) {
          setConversationState(normalizedId);
          syncRecent(normalizedId);
          setSelectedDealId(normalizeConversationId(convo.dealId));
        }

        setMessages(loaded);
      } finally {
        void reloadConversations();
      }
    },
    [reloadConversations, setConversationState, syncRecent],
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

      if (event.type === 'agent_switch') {
        setCurrentAgent(event.agentName);
      } else if (event.type === 'agent_progress' && event.lastAgentName) {
        setCurrentAgent(event.lastAgentName);
      }

      if (event.type === 'done') {
        setIsStreaming(false);
        setCurrentAgent(null);
        if (event.conversationId) {
          syncRecent(event.conversationId);
          setConversationState(event.conversationId);
          void reloadConversations();
        }
      }
    },
    [reloadConversations, setConversationState, syncRecent],
  );

  const handleSend = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };

      const resetState = createStreamPresenterState();
      resetState.conversationId = conversationIdRef.current;
      presenterRef.current = resetState;
      setPresenterState(resetState);
      setCurrentAgent(null);
      setAgentSummary(null);
      setIsStreaming(true);
      setMessages((current) => [...current, userMessage]);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            conversationId: conversationIdRef.current,
            dealId: selectedDealId,
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
    [applyEvent, selectedDealId],
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setCurrentAgent(null);
  }, []);

  useEffect(() => {
    const reloadHandler = () => {
      const conversationRouteId =
        typeof window === 'undefined'
          ? null
          : new URLSearchParams(window.location.search).get('conversationId');
      if (conversationRouteId && conversationRouteId !== conversationIdRef.current) {
        void loadConversation(conversationRouteId);
      }
    };

    window.addEventListener('chat:reopen-conversation', reloadHandler);
    return () => {
      window.removeEventListener('chat:reopen-conversation', reloadHandler);
    };
  }, [loadConversation]);

  const visibleMessages = messages;

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={conversationId}
        onConversationSelect={loadConversation}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((value) => !value)}
        onRefresh={reloadConversations}
        loading={isLoadingConversations}
        hasRecentRecents={hasRecentConversations}
        recentConversationIds={recentConversationIds}
      />

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <DealSelector
            selectedDealId={selectedDealId}
            onSelect={setSelectedDealId}
          />
          <span className="text-xs text-muted-foreground">{messageSectionTitle}</span>
        </div>

        {currentAgent && <AgentIndicator agentName={currentAgent} />}

        {agentSummary && AUI_MESSAGE_ENHANCEMENTS ? (
          <div className="border-b px-4 py-3">
            <AgentStatePanel
              lastAgentName={agentSummary.lastAgentName ?? currentAgent ?? 'Coordinator'}
              plan={agentSummary.verificationSteps}
              confidence={agentSummary.confidence}
              missingEvidence={agentSummary.missingEvidence ?? []}
              verificationSteps={agentSummary.verificationSteps ?? []}
              evidenceCitations={agentSummary.evidenceCitations ?? []}
              toolsInvoked={agentSummary.toolsInvoked ?? []}
              packVersionsUsed={agentSummary.packVersionsUsed ?? []}
              proofChecks={agentSummary.proofChecks ?? []}
              retryAttempts={agentSummary.retryAttempts}
              retryMaxAttempts={agentSummary.retryMaxAttempts}
              retryMode={agentSummary.retryMode}
              fallbackLineage={agentSummary.fallbackLineage}
              fallbackReason={agentSummary.fallbackReason}
              toolFailureDetails={agentSummary.toolFailures}
              errorSummary={agentSummary.errorSummary ?? null}
            />
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden">
          <MessageList
            messages={visibleMessages}
            isStreaming={isStreaming}
            conversationId={conversationId}
            onSuggestionClick={handleSend}
          />
        </div>

        <ChatInput onSend={handleSend} isStreaming={isStreaming} onStop={handleStop} />
      </div>
    </div>
  );
}
