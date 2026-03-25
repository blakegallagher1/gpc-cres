'use client';

import { useMemo, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  MessageSquare,
  Filter,
  CalendarClock,
  Building2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatOperatorDate } from '@/lib/formatters/operatorFormatters';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/lib/chat/types';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onConversationSelect: (conversationId: string | null) => void;
  open: boolean;
  onToggle: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  hasRecentRecents?: boolean;
  recentConversationIds?: string[];
  mobile?: boolean;
  showCollapsedTrigger?: boolean;
}

export type ConversationFilterMode = 'all' | 'deals' | 'no-deal';

type ConversationFilterCounts = Record<ConversationFilterMode, number>;

/**
 * Applies sidebar search and scope filters to the conversation index.
 */
export function filterConversations({
  conversations,
  search,
  filter,
  onlyRecent,
  recentConversationIds,
}: {
  conversations: ConversationSummary[];
  search: string;
  filter: ConversationFilterMode;
  onlyRecent: boolean;
  recentConversationIds: string[];
}): ConversationSummary[] {
  const normalized = search.trim().toLowerCase();
  let list = conversations.filter((conv) => {
    const hasDeal = Boolean(conv.dealId);
    if (filter === 'deals' && !hasDeal) return false;
    if (filter === 'no-deal' && hasDeal) return false;
    if (!normalized) return true;

    const title = (conv.title ?? '').toLowerCase();
    return title.includes(normalized);
  });

  if (onlyRecent && recentConversationIds.length > 0) {
    const recentSet = new Set(recentConversationIds);
    const recentSubset = list.filter((conv) => recentSet.has(conv.id));
    const byRecency = new Map<string, number>();
    recentConversationIds.forEach((id, index) => {
      byRecency.set(id, index);
    });
    return recentSubset
      .sort(
        (a, b) =>
          (byRecency.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (byRecency.get(b.id) ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, 5);
  }

  list = [...list].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return list;
}

function formatShortDate(value: string): string {
  return formatOperatorDate(value, {
    month: 'short',
    day: 'numeric',
  });
}

function getConversationFilterCounts(
  conversations: ConversationSummary[],
): ConversationFilterCounts {
  return {
    all: conversations.length,
    deals: conversations.filter((conversation) => Boolean(conversation.dealId)).length,
    'no-deal': conversations.filter((conversation) => !conversation.dealId).length,
  };
}

function ConversationListItem({
  conv,
  active,
  onSelect,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '!h-auto !w-full !justify-start !items-start group gap-3 border border-transparent px-3 py-3 text-left transition-colors',
        active
          ? 'border-border/70 bg-foreground/[0.05]'
          : 'hover:border-border/60 hover:bg-background/70',
      )}
    >
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-medium text-foreground">
            {conv.title && conv.title.trim().length > 0 ? conv.title : 'Untitled conversation'}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatShortDate(conv.updatedAt)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>{conv.messageCount} msgs</span>
          <span className="text-border">/</span>
          <span>{conv.dealId ? 'Deal-linked' : 'General scope'}</span>
          {active ? (
            <>
              <span className="text-border">/</span>
              <span className="font-medium text-foreground">Active</span>
            </>
          ) : null}
        </div>
      </div>
      {conv.dealId ? (
        <Badge variant="secondary" className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]">
          <Building2 className="h-2.5 w-2.5" />
          Deal
        </Badge>
      ) : (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border/80 transition-colors group-hover:bg-foreground/25" />
      )}
    </Button>
  );
}

/**
 * Local conversation rail for the primary chat workspace.
 */
export function ConversationSidebar({
  conversations,
  activeConversationId,
  onConversationSelect,
  open,
  onToggle,
  onRefresh,
  loading = false,
  hasRecentRecents = false,
  recentConversationIds = [],
  mobile = false,
  showCollapsedTrigger = true,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'deals' | 'no-deal'>('all');
  const [onlyRecent, setOnlyRecent] = useState(false);

  const filteredConversations = useMemo(() => {
    return filterConversations({
      conversations,
      search,
      filter,
      onlyRecent,
      recentConversationIds,
    });
  }, [search, conversations, filter, onlyRecent, recentConversationIds]);
  const filterCounts = useMemo(
    () => getConversationFilterCounts(conversations),
    [conversations],
  );

  const recentLabel =
    onlyRecent || filter !== 'all' || search.trim().length > 0
      ? 'Filtered'
      : 'Recent';
  const sortingLabel = onlyRecent ? 'Top 5 by local recency' : 'Sorted by last update';

  const railContent = (
    <>
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Conversation Runs
            </p>
            <h2 className="mt-1 text-sm font-semibold tracking-tight">Conversations</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Reopen a saved thread or start a fresh run.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => {
                onConversationSelect(null);
                if (mobile) {
                  onToggle();
                }
              }}
              aria-label="Start new chat"
              title="Start new chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {onRefresh ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={onRefresh}
                title="Refresh conversations"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={mobile ? 'Close history' : 'Close conversation rail'}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{conversations.length} saved</span>
          <span className="text-border">/</span>
          <span>{hasRecentRecents ? 'Local recents available' : 'No local recents yet'}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="h-9 w-full rounded-2xl pl-9 pr-3 text-xs placeholder:text-muted-foreground/70"
            disabled={loading}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as ConversationFilterMode)} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-full border border-border/70 bg-background/70 p-1">
              <TabsTrigger value="all" className="h-8 gap-2 rounded-full border-b-0 px-2.5 py-1 text-[11px]">
                <span>All</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                  {filterCounts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="deals" className="h-8 gap-2 rounded-full border-b-0 px-2.5 py-1 text-[11px]">
                <span>Deals</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                  {filterCounts.deals}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="no-deal" className="h-8 gap-2 rounded-full border-b-0 px-2.5 py-1 text-[11px]">
                <span>General</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                  {filterCounts['no-deal']}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            type="button"
            variant={onlyRecent ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setOnlyRecent((value) => !value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors',
              onlyRecent
                ? 'border-foreground/20 bg-foreground text-background'
                : 'border-border/70 text-muted-foreground hover:text-foreground',
              !hasRecentRecents && 'opacity-50',
            )}
            disabled={!hasRecentRecents}
            title={hasRecentRecents ? 'Keep local top 5 recents only' : 'No recents available'}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {recentLabel}
          </Button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            <span>{filteredConversations.length} shown</span>
          </div>
          <span>{sortingLabel}</span>
        </div>
      </div>

      <Separator />

      <div className="min-h-0 flex-1 px-3 py-3">
        {loading ? (
          <div className="flex flex-col gap-2 px-1 py-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-3">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No conversations match this view.</p>
            <p>Start a new run or widen the filters.</p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-1">
            <div className="flex flex-col gap-1">
              <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {recentLabel}
              </div>
              {filteredConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conv={conversation}
                  active={conversation.id === activeConversationId}
                  onSelect={() => {
                    onConversationSelect(conversation.id);
                    if (mobile) {
                      onToggle();
                    }
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </>
  );

  return (
    <>
      {!open && showCollapsedTrigger ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            'app-shell-panel flex h-10 w-10 items-center justify-center text-muted-foreground shadow-lg transition-colors hover:text-foreground',
            mobile
              ? 'fixed bottom-4 left-4 z-20 rounded-full border border-border/60 bg-background/92 backdrop-blur-xl lg:hidden'
              : 'absolute left-3 top-4 z-20 rounded-2xl',
          )}
          aria-label={mobile ? 'Open history' : 'Open conversation rail'}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      ) : null}

      {mobile ? (
        <>
          {open ? (
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/45 lg:hidden"
              aria-label="Close history"
              onClick={onToggle}
            />
          ) : null}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-40 flex w-[min(22rem,calc(100vw-1.25rem))] max-w-full flex-col border-r border-border/60 bg-background/96 backdrop-blur-xl transition-transform duration-200 lg:hidden',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {railContent}
          </div>
        </>
      ) : (
        <div
          className={cn(
            'flex h-full flex-col border-r border-border/60 bg-background/76 backdrop-blur-xl transition-all duration-200',
            open ? 'w-72' : 'w-0 overflow-hidden',
          )}
        >
          {railContent}
        </div>
      )}
    </>
  );
}
