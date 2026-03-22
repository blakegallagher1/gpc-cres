'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
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
      <div className="chat-thread-surface flex h-full items-center justify-center overflow-y-auto px-4 sm:px-6">
        <div className="w-full max-w-xl space-y-6 py-8">
          {/* Compact heading */}
          <div className="space-y-2 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              {emptyState.eyebrow}
            </p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {emptyState.title}
            </h3>
            <p className="mx-auto max-w-sm text-xs leading-5 text-muted-foreground">
              {emptyState.description}
            </p>
          </div>

          {/* Suggestion chips — tight, functional */}
          <div className="space-y-1">
            {emptyState.suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="chat-fade-in group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.04]"
                style={{ animationDelay: `${index * 60 + 80}ms` }}
              >
                <span className="text-sm text-foreground/80 group-hover:text-foreground">
                  {suggestion}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/60" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="chat-thread-surface h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[54rem] space-y-3 px-4 py-6 sm:px-6">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            conversationId={conversationId}
            onToolApprovalEvents={onToolApprovalEvents}
          />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background">
              <span className="font-mono text-[9px] font-medium text-foreground/70">G</span>
            </div>
            <div className="rounded-xl border border-border/50 bg-background px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '0ms' }} />
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '200ms' }} />
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '400ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
