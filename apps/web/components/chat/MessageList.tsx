'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, Terminal } from 'lucide-react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import type { ChatStreamEvent } from '@/lib/chat/types';

interface MessageListEmptyState {
  eyebrow: string;
  title: string;
  description: string;
  suggestions: string[];
}

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestionClick?: (text: string) => void;
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void;
  conversationId?: string | null;
  emptyState?: MessageListEmptyState;
}

const DEFAULT_EMPTY_STATE: MessageListEmptyState = {
  eyebrow: 'New run',
  title: 'Start with a parcel, market, or capital question.',
  description:
    'Use the run surface for site diligence, zoning answers, risk review, and investment decision support.',
  suggestions: [
    'Screen a new deal',
    'Summarize zoning risk',
    'Build a diligence list',
    'Review capital structure options',
  ],
};

const DEFAULT_EMPTY_STATE_SIGNALS = [
  {
    label: 'Parcel',
    detail: 'Site scan, ownership, adjacency, and immediate physical risk.',
  },
  {
    label: 'Entitlement',
    detail: 'Zoning posture, precedent, setbacks, and process friction.',
  },
  {
    label: 'Capital',
    detail: 'Debt, equity, and underwriting tradeoffs before the memo starts.',
  },
] as const;

/**
 * Scrollable message transcript with empty and live-streaming states.
 */
export function MessageList({
  messages,
  isStreaming,
  onSuggestionClick,
  onToolApprovalEvents,
  conversationId,
  emptyState = DEFAULT_EMPTY_STATE,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="chat-thread-surface relative flex h-full items-center overflow-hidden px-6 py-10 md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-foreground/[0.03]" />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/70">
              <Terminal className="h-5 w-5 text-foreground/80" />
            </div>
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                {emptyState.eyebrow}
              </p>
              <h3 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground">
                {emptyState.title}
              </h3>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {emptyState.description}
              </p>
            </div>
            <div className="grid gap-3 border-y border-border/60 py-4 sm:grid-cols-3">
              {DEFAULT_EMPTY_STATE_SIGNALS.map((signal) => (
                <div key={signal.label}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {signal.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">{signal.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 lg:w-[25rem]">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Run starts
              </p>
              <p className="text-xs text-muted-foreground">Suggested prompts</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {emptyState.suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="chat-fade-in group flex items-center justify-between rounded-2xl border border-border/70 bg-background/78 px-4 py-3 text-left text-sm transition-colors hover:border-foreground/20 hover:bg-background"
                  style={{ animationDelay: `${index * 90 + 120}ms` }}
                >
                  <span className="pr-4 text-foreground/90">{suggestion}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="chat-thread-surface h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            conversationId={conversationId}
            onToolApprovalEvents={onToolApprovalEvents}
          />
        ))}

        {/* Streaming indicator — frosted pill with wave dots */}
        {isStreaming && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/85">
              <span className="font-mono text-[10px] font-medium text-foreground/80">G</span>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-foreground/55" style={{ animationDelay: '0ms' }} />
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-foreground/55" style={{ animationDelay: '200ms' }} />
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-foreground/55" style={{ animationDelay: '400ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
