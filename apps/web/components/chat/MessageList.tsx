'use client';

import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestionClick?: (text: string) => void;
}

export function MessageList({ messages, isStreaming, onSuggestionClick }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MessageCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="max-w-sm space-y-2">
            <h3 className="text-lg font-semibold">Start a conversation</h3>
            <p className="text-sm text-muted-foreground">
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
                className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700">
              <span className="text-xs font-semibold text-white">G</span>
            </div>
            <div className="rounded-2xl border bg-card px-4 py-3">
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
