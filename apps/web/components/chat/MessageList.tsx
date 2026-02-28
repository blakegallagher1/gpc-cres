'use client';

import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { cn } from '@/lib/utils';
import type { ChatStreamEvent } from '@/lib/chat/types';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestionClick?: (text: string) => void;
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void;
  conversationId?: string | null;
}

export function MessageList({
  messages,
  isStreaming,
  onSuggestionClick,
  onToolApprovalEvents,
  conversationId,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-200 bg-white/80 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <MessageCircle className="h-8 w-8 text-neutral-500 dark:text-neutral-400" />
          </div>
          <div className="max-w-sm space-y-2">
            <h3 className="text-lg font-semibold">Start a conversation</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Ask about parcels, deals, zoning, or anything CRE. Your AI agents are
              standing by.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              'Screen a new deal',
              'Zoning lookup',
              'Run due diligence',
              'Market comps',
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
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
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700">
              <span className="text-xs font-semibold text-white">G</span>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
              <div className="flex items-center gap-1">
                <span className={cn('h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce')} style={{ animationDelay: '0ms' }} />
                <span className={cn('h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce')} style={{ animationDelay: '150ms' }} />
                <span className={cn('h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce')} style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
