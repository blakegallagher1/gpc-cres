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
    label: 'Scope',
    detail: 'Lead with a parcel, address, deal, market, or file.',
  },
  {
    label: 'Deliverable',
    detail: 'Ask for a screen, memo, checklist, comparison, or action plan.',
  },
  {
    label: 'Constraints',
    detail: 'State timing, assumptions, decision bar, or approval thresholds.',
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
      <div className="chat-thread-surface h-full overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <section className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/72">
                <Terminal className="h-5 w-5 text-foreground/80" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {emptyState.eyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {emptyState.title}
                </h3>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {emptyState.description}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {DEFAULT_EMPTY_STATE_SIGNALS.map((signal) => (
                <div
                  key={signal.label}
                  className="workspace-surface workspace-surface-muted rounded-2xl px-4 py-4 shadow-none"
                >
                  <p className="workspace-stat-label">{signal.label}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{signal.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="workspace-surface rounded-2xl p-4 shadow-none">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Suggested Runs</p>
                <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  Start from a concrete ask
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Launch and refine in thread</p>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
              {emptyState.suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="chat-fade-in group flex w-full items-center justify-between gap-4 border-b border-border/60 px-4 py-4 text-left text-sm transition-colors last:border-b-0 hover:bg-background/80"
                  style={{ animationDelay: `${index * 75 + 100}ms` }}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{suggestion}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Use this as the first turn, then tighten scope and constraints in follow-up.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </section>
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
