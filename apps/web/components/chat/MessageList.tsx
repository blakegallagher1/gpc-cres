'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { getResearchLaneLabel } from '@/lib/agent/researchRouting';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import type { ChatStreamEvent } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Run Document Head — editorial header for the active thread         */
/* ------------------------------------------------------------------ */

interface RunDocumentHeadProps {
  runTitle: string;
  startedAt?: string;
  turn?: string;
  tokens?: string;
  className?: string;
}

export function RunDocumentHead({ runTitle, startedAt, turn, tokens, className }: RunDocumentHeadProps) {
  return (
    <div
      className={cn(
        'mb-5 flex items-end justify-between gap-6 border-b border-rule pb-3',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="ed-eyebrow mb-0.5" style={{ letterSpacing: '0.18em' }}>
          Active Run
        </div>
        <div className="truncate font-display text-[18px] font-semibold tracking-[-0.01em] text-ink">
          {runTitle}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        {startedAt && <MetaCell k="Started" v={startedAt} />}
        {turn && <MetaCell k="Turn" v={turn} />}
        {tokens && <MetaCell k="Tokens" v={tokens} />}
      </div>
    </div>
  );
}

function MetaCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="whitespace-nowrap">
      <span className="ed-eyebrow-tight mr-1">{k}</span>
      <span className="font-mono text-[11px] font-semibold text-ink">{v}</span>
    </div>
  );
}

export function StreamingIndicator({ label = 'Coordinator is routing agents' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 font-mono text-[12px] text-ink-fade">
      <span className="ed-pulse h-1.5 w-1.5 rounded-full bg-ed-accent" />
      <span>{label}</span>
    </div>
  );
}

export interface MessageListShellProps {
  runTitle: string;
  startedAt?: string;
  turn?: string;
  tokens?: string;
  children: ReactNode;
}

export function MessageListShell({ runTitle, startedAt, turn, tokens, children }: MessageListShellProps) {
  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-[940px] px-6 py-5 sm:px-9">
        <RunDocumentHead
          runTitle={runTitle}
          startedAt={startedAt}
          turn={turn}
          tokens={tokens}
        />
        <div className="flex flex-col gap-3.5">{children}</div>
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state and full message list                                  */
/* ------------------------------------------------------------------ */

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
  onRetry?: () => void;
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

export function MessageList({
  messages,
  isStreaming,
  onSuggestionClick,
  onToolApprovalEvents,
  onRetry,
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
    ? activeResearchLane === 'auto'
      ? 'Auto'
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
    if (!viewport) return;

    const handleScroll = () => {
      const nextIsNearBottom = isNearBottom(viewport);
      isNearBottomRef.current = nextIsNearBottom;
      if (nextIsNearBottom) setShowJumpToLatest(false);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
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
      <div className="flex h-full items-center justify-center overflow-y-auto bg-paper px-6 sm:px-9">
        <motion.div
          className="flex w-full max-w-[940px] flex-col gap-6 py-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded border border-rule bg-paper-panel p-6 sm:p-8 ed-shadow-md">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-ed-accent bg-ed-accent-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ed-accent">
                {emptyState.eyebrow}
              </span>
              <span className="rounded-full border border-rule bg-paper-soft px-2.5 py-1 font-mono text-[10px] text-ink-fade">
                Verification-first answers
              </span>
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.75fr)]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="max-w-[16ch] font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
                    {emptyState.title}
                  </h3>
                  <p className="max-w-xl text-[14px] leading-[1.6] text-ink-soft">
                    {emptyState.description}
                  </p>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {emptyState.suggestions.map((suggestion, index) => (
                    <motion.div
                      key={suggestion}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: 0.06 + index * 0.04 }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onSuggestionClick?.(suggestion)}
                        className="!flex h-auto w-full items-start justify-between gap-3 rounded border border-rule bg-paper-panel px-3.5 py-3 text-left transition-colors hover:border-ink hover:bg-paper-soft"
                      >
                        <div className="space-y-1">
                          <span className="text-[13px] font-medium text-ink">{suggestion}</span>
                          <p className="text-[11px] leading-[1.45] text-ink-fade">
                            Launch as run brief.
                          </p>
                        </div>
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>

              {emptyState.detailItems?.length ? (
                <div className="border-t border-rule pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="ed-eyebrow">{emptyState.detailHeading ?? 'Detail'}</p>
                  <div className="mt-3 space-y-2.5">
                    {emptyState.detailItems.map((item) => (
                      <div
                        key={`${item.label}-${item.title}`}
                        className="rounded border border-rule bg-paper-panel p-3"
                      >
                        <p className="ed-eyebrow">{item.label}</p>
                        <p className="mt-1 text-[13px] font-medium text-ink">{item.title}</p>
                        <p className="mt-0.5 text-[11px] leading-[1.45] text-ink-fade">{item.detail}</p>
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

  const firstMessage = messages[0];
  const runTitle = conversationId ? 'Active run transcript' : 'Live operator transcript';
  const startedAt = firstMessage?.createdAt
    ? new Date(firstMessage.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : undefined;

  return (
    <div className="relative h-full">
      <ScrollArea ref={scrollAreaRef} className="h-full bg-paper">
        <div className="mx-auto flex w-full max-w-[940px] flex-col gap-3.5 px-6 py-5 sm:px-9">
          <RunDocumentHead
            runTitle={runTitle}
            startedAt={startedAt}
            turn={formatMessageCount(messages.length)}
          />

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <MessageBubble
                  message={msg}
                  conversationId={conversationId}
                  onToolApprovalEvents={onToolApprovalEvents}
                  onRetry={msg.eventKind === 'error' ? onRetry : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Streaming indicator */}
          <AnimatePresence>
            {isStreaming && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
              >
                <StreamingIndicator />
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Jump to latest */}
      <AnimatePresence>
        {showJumpToLatest && (
          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end px-6 pb-4 sm:px-9"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Button
              type="button"
              size="sm"
              className="pointer-events-auto rounded bg-ink px-3.5 text-[12px] text-paper-panel ed-shadow-md"
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
