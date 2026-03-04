'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
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
      <div className="relative flex h-full flex-col items-center justify-center px-6">
        {/* Atmospheric orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 h-80 w-80 rounded-full bg-blue-600/5 blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-slate-500/5 blur-[100px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          {/* Icon with glow */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-[#1e2230] bg-[#12141c]/80 shadow-lg">
            <div className="absolute inset-0 rounded-2xl bg-blue-500/10 blur-xl" />
            <Terminal className="relative z-10 h-9 w-9 text-blue-400" />
          </div>

          <div className="max-w-sm space-y-2">
            <h3 className="font-mono text-xl font-medium tracking-tight text-slate-100">
              Command Ready
            </h3>
            <p className="text-sm text-slate-500">
              Your 13 AI agents are standing by. Ask about deals, zoning, site
              feasibility, or entitlement strategy.
            </p>
          </div>

          {/* Suggestion pills with staggered animation */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            {[
              'Screen a new deal',
              'Zoning lookup',
              'Run due diligence',
              'Market comps',
            ].map((suggestion, i) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="chat-fade-in rounded-full border border-[#2a2f3e] bg-[#1a1d28]/80 px-4 py-2 font-mono text-xs text-slate-400 transition-all hover:border-blue-500/40 hover:bg-[#1e2230] hover:text-slate-200"
                style={{ animationDelay: `${i * 100 + 200}ms` }}
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
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6 sm:px-6">
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
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e2230] to-[#2a2f3e] ring-1 ring-[#2a2f3e]">
              <span className="font-mono text-[10px] font-medium text-blue-400">G</span>
            </div>
            <div className="rounded-lg border border-[#2a2f3e] bg-[#1a1d28]/80 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-blue-400/70" style={{ animationDelay: '0ms' }} />
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-blue-400/70" style={{ animationDelay: '200ms' }} />
                <span className="wave-dot h-1.5 w-1.5 rounded-full bg-blue-400/70" style={{ animationDelay: '400ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
