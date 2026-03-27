'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const getViewportElement = () =>
    scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;

  const isNearBottom = (element: HTMLDivElement) => {
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom <= 120;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const viewport = getViewportElement();
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const nextIsNearBottom = isNearBottom(viewport);
      isNearBottomRef.current = nextIsNearBottom;

      if (nextIsNearBottom) {
        setShowJumpToLatest(false);
      }
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [messages.length]);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const hasNewMessage = messages.length > previousMessageCount;
    const latestMessage = messages[messages.length - 1];
    const userSentMessage = hasNewMessage && latestMessage?.role === 'user';
    const shouldAutoScroll = isNearBottomRef.current || userSentMessage;

    if (shouldAutoScroll) {
      scrollToBottom('smooth');
      setShowJumpToLatest(false);
    } else if (hasNewMessage || isStreaming) {
      setShowJumpToLatest(true);
    }

    previousMessageCountRef.current = messages.length;
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="chat-thread-surface flex h-full items-center justify-center overflow-y-auto px-4 sm:px-6">
        <motion.div
          className="flex w-full max-w-xl flex-col gap-6 py-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
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
              <motion.div
                key={suggestion}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.08 + index * 0.05 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="group !flex h-auto w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
                >
                  <span className="text-sm text-foreground/80 group-hover:text-foreground">
                    {suggestion}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                </Button>
              </motion.div>
            ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <ScrollArea ref={scrollAreaRef} className="chat-thread-surface h-full">
        <div className="mx-auto flex w-full max-w-[54rem] flex-col gap-3 px-4 py-6 sm:px-6">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <MessageBubble
                  message={msg}
                  conversationId={conversationId}
                  onToolApprovalEvents={onToolApprovalEvents}
                />
              </motion.div>
            ))}
          </AnimatePresence>

        {/* Streaming indicator */}
        <AnimatePresence>
          {isStreaming && (
          <motion.div
            className="flex items-start gap-3"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
          >
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
          </motion.div>
          )}
        </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <AnimatePresence>
      {showJumpToLatest && (
        <motion.div
          className="pointer-events-none absolute bottom-4 right-4 z-10"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          <Button
            type="button"
            size="sm"
            className="pointer-events-auto rounded-full shadow-lg"
            onClick={() => {
              scrollToBottom('smooth');
              isNearBottomRef.current = true;
              setShowJumpToLatest(false);
            }}
          >
            Jump to latest
          </Button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
