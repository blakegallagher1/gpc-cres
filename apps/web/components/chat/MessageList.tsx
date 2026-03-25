'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="chat-thread-surface flex h-full items-center justify-center overflow-y-auto px-4 sm:px-6">
        <div className="flex w-full max-w-xl flex-col gap-6 py-8">
          <div className="flex flex-col gap-2 text-center">
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

          <Card className="border-border/60 bg-background/55">
            <CardContent className="flex flex-col gap-1 p-2">
            {emptyState.suggestions.map((suggestion, index) => (
              <Button
                key={suggestion}
                type="button"
                variant="ghost"
                onClick={() => onSuggestionClick?.(suggestion)}
                className="chat-fade-in group !flex h-auto w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
                style={{ animationDelay: `${index * 60 + 80}ms` }}
              >
                <span className="text-sm text-foreground/80 group-hover:text-foreground">
                  {suggestion}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/60" />
              </Button>
            ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="chat-thread-surface h-full">
      <div className="mx-auto flex w-full max-w-[54rem] flex-col gap-3 px-4 py-6 sm:px-6">
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
            <Card className="border-border/50 bg-background/85">
              <CardContent className="px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '0ms' }} />
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '200ms' }} />
                <span className="wave-dot h-1 w-1 rounded-full bg-foreground/40" style={{ animationDelay: '400ms' }} />
              </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
