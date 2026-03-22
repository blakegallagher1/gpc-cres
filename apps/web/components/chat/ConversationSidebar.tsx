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
import { Button } from '@/components/ui/button';
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
    return recentSubset.sort(
      (a, b) =>
        (byRecency.get(a.id) ?? Number.POSITIVE_INFINITY) -
        (byRecency.get(b.id) ?? Number.POSITIVE_INFINITY),
    ).slice(0, 5);
  }

  list = [...list].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return list;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleDateString([], {
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
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors',
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
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          <Building2 className="h-2.5 w-2.5" />
          Deal
        </span>
      ) : (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border/80 transition-colors group-hover:bg-foreground/25" />
      )}
    </button>
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

  return (
    <>
      {!open && (
        <button
          onClick={onToggle}
          className="app-shell-panel absolute left-3 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground shadow-lg transition-colors hover:text-foreground"
          aria-label="Open conversation rail"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div
        className={cn(
          'flex h-full flex-col border-r border-border/60 bg-background/76 backdrop-blur-xl transition-all duration-200',
          open ? 'w-72' : 'w-0 overflow-hidden',
        )}
      >
        <div className="border-b border-border/60 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Run History
              </p>
              <h2 className="mt-1 text-sm font-semibold tracking-tight">Saved threads</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Reopen prior runs, search the archive, or fork a fresh operating thread.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => onConversationSelect(null)}
                title="Start new chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              {onRefresh ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  onClick={onRefresh}
                  title="Refresh conversations"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
              <button
                onClick={onToggle}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close conversation rail"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{conversations.length} saved</span>
            <span className="text-border">/</span>
            <span>{hasRecentRecents ? 'Local recents available' : 'No local recents yet'}</span>
          </div>
        </div>

        <div className="space-y-3 border-b border-border/60 px-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles or reopen a prior run"
              className="h-9 w-full rounded-2xl border border-border/70 bg-background/80 pl-9 pr-3 text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  'rounded-full px-2.5 py-1 transition-colors',
                  filter === 'all' ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground',
                )}
              >
                All {filterCounts.all}
              </button>
              <button
                onClick={() => setFilter('deals')}
                className={cn(
                  'rounded-full px-2.5 py-1 transition-colors',
                  filter === 'deals' ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground',
                )}
              >
                Deals {filterCounts.deals}
              </button>
              <button
                onClick={() => setFilter('no-deal')}
                className={cn(
                  'rounded-full px-2.5 py-1 transition-colors',
                  filter === 'no-deal' ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground',
                )}
              >
                General {filterCounts['no-deal']}
              </button>
            </div>
            <button
              onClick={() => setOnlyRecent((previous) => !previous)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors',
                onlyRecent
                  ? 'border-border/70 bg-foreground/8 text-foreground'
                  : 'border-border/70 text-muted-foreground',
                !hasRecentRecents && 'opacity-50',
              )}
              disabled={!hasRecentRecents}
              title={hasRecentRecents ? 'Keep local top 5 recents only' : 'No recents available'}
            >
              <Filter className="h-3 w-3" />
              Local Top 5
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{filteredConversations.length} shown</span>
            <span>{sortingLabel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading conversations...</p>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                {search.trim().length > 0 ? 'No matching conversations' : 'No conversations yet'}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {search.trim().length > 0
                  ? 'Adjust the search or filter state to reopen a prior thread.'
                  : 'Start a fresh run to create the first saved thread in this workspace.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {recentLabel}
              </div>
              {filteredConversations.map((conv) => (
                <ConversationListItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeConversationId}
                  onSelect={() => onConversationSelect(conv.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
