'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getResearchLaneLabel } from '@/lib/agent/researchRouting';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import type { ChatStreamEvent } from '@/lib/chat/types';

interface MessageListEmptyState {
  eyebrow: string;
  title: string;
  description: string;
  suggestions: string[];
  detailHeading?: string;
  detailItems?: Array<{
    label: string;
    title: string;
    detail: string;
  }>;
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
  detailHeading: 'Typical outputs',
  detailItems: [
    {
      label: 'Screen',
      title: 'Entitlement screen',
      detail: 'Summarize zoning pressure, setbacks, constraints, and the immediate follow-up path.',
    },
    {
      label: 'Memo',
      title: 'Decision memo',
      detail: 'Package the tradeoffs, risks, and recommended next move into a format you can circulate.',
    },
    {
      label: 'Checklist',
      title: 'Diligence checklist',
      detail: 'Turn a broad site question into a sequenced list of tasks, documents, and approvals.',
    },
  ],
};

function formatMessageCount(count: number): string {
  return `${count} message${count === 1 ? '' : 's'}`;
}

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
  const activeResearchLane = [...messages]
    .reverse()
    .find((message) => message.trust?.researchLane)?.trust?.researchLane;
  const activeResearchLaneLabel = activeResearchLane
    ? activeResearchLane === "auto"
      ? "Auto"
      : getResearchLaneLabel(activeResearchLane)
    : null;

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
          className="flex w-full max-w-5xl flex-col gap-8 py-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <div className="rounded-[2rem] border border-border/65 bg-background/96 p-6 shadow-[0_32px_90px_-54px_rgba(15,23,42,0.45)] sm:p-8">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
                {emptyState.eyebrow}
              </span>
              <span className="rounded-full border border-border/70 bg-background/94 px-3 py-1 text-[11px] text-muted-foreground">
                Operator-grade run desk
              </span>
              <span className="rounded-full border border-border/70 bg-background/94 px-3 py-1 text-[11px] text-muted-foreground">
                Verification-first answers
              </span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.75fr)]">
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-[2.4rem]">
                  {emptyState.title}
                </h3>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {emptyState.description}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
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
                      className="group !flex h-auto w-full items-start justify-between gap-4 rounded-[1.35rem] border border-border/65 bg-background/92 px-4 py-4 text-left shadow-[0_18px_50px_-40px_rgba(15,23,42,0.42)] transition-[transform,border-color,background-color] hover:translate-y-[-1px] hover:border-foreground/18 hover:bg-accent/40"
                    >
                      <div className="space-y-1">
                        <span className="text-left text-base text-foreground/86 group-hover:text-foreground">
                          {suggestion}
                        </span>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Launch this as the run brief and let the workspace fill in the evidence lane.
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/70" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>

            {emptyState.detailItems?.length ? (
              <div className="border-t border-border/45 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  {emptyState.detailHeading ?? 'Detail'}
                </p>
                <div className="mt-4 space-y-3">
                  {emptyState.detailItems.map((item) => (
                    <div
                      key={`${item.label}-${item.title}`}
                      className="space-y-1.5 rounded-[1.35rem] border border-border/50 bg-background/90 p-4 shadow-[0_18px_45px_-40px_rgba(15,23,42,0.34)]"
                    >
                      <p className="workspace-stat-label">{item.label}</p>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background via-background/92 to-transparent" />
      <ScrollArea ref={scrollAreaRef} className="chat-thread-surface h-full">
        <div className="mx-auto flex w-full max-w-[68rem] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="sticky top-0 z-10 -mx-2 mb-2 px-2">
            <div className="flex items-center justify-between gap-3 rounded-full border border-border/65 bg-background/95 px-4 py-2 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.45)]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <p className="truncate text-sm font-medium tracking-[-0.02em] text-foreground">
                  {conversationId ? 'Active run transcript' : 'Live operator transcript'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {activeResearchLaneLabel ? (
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-300">
                    {activeResearchLaneLabel}
                  </span>
                ) : null}
                <span className="rounded-full border border-border/60 bg-background/94 px-2.5 py-1">
                  {formatMessageCount(messages.length)}
                </span>
                <span className="rounded-full border border-border/60 bg-background/94 px-2.5 py-1">
                  {isStreaming ? 'Streaming' : 'Stable'}
                </span>
              </div>
            </div>
          </div>

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
            <Card className="border-border/60 bg-background/94">
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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end px-4 pb-4 sm:px-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/92 to-transparent" />
          <Button
            type="button"
            size="sm"
            className="pointer-events-auto rounded-full border border-border/60 bg-background/96 px-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)]"
            onClick={() => {
              scrollToBottom('smooth');
              isNearBottomRef.current = true;
              setShowJumpToLatest(false);
            }}
            aria-live="polite"
          >
            {isStreaming ? 'Follow live output' : 'Jump to latest'}
          </Button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
