'use client';

import { useMemo, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
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
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {conv.title && conv.title.trim().length > 0 ? conv.title : 'Untitled conversation'}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" />
          <span>{formatShortDate(conv.updatedAt)}</span>
          <span>{conv.messageCount} msgs</span>
          {conv.dealId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px]">
              <Building2 className="h-2.5 w-2.5" />
              Deal
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

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

  const recentLabel =
    onlyRecent || filter !== 'all' || search.trim().length > 0
      ? 'Filtered'
      : 'Recent';

  return (
    <>
      {!open && (
        <button
          onClick={onToggle}
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <div
        className={cn(
          'flex h-full flex-col border-r bg-card/50 transition-all duration-200',
          open ? 'w-72' : 'w-0 overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Conversations</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onConversationSelect(null)}
              title="Start new chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {onRefresh ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRefresh}
                title="Refresh conversations"
              >
                <Filter className="h-4 w-4" />
              </Button>
            ) : null}
            <button
              onClick={onToggle}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2 border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="h-8 w-full rounded-md border-0 bg-muted pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  'rounded-full px-2 py-1',
                  filter === 'all' ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilter('deals')}
                className={cn(
                  'rounded-full px-2 py-1',
                  filter === 'deals' ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                Deals
              </button>
              <button
                onClick={() => setFilter('no-deal')}
                className={cn(
                  'rounded-full px-2 py-1',
                  filter === 'no-deal' ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                No Deal
              </button>
            </div>
            <button
              onClick={() => setOnlyRecent((previous) => !previous)}
              className={cn(
                'rounded-full px-2 py-1',
                onlyRecent ? 'bg-muted font-medium' : 'text-muted-foreground',
                !hasRecentRecents && 'opacity-50',
              )}
              disabled={!hasRecentRecents}
              title={hasRecentRecents ? 'Keep top 5 recents only' : 'No recents available'}
            >
              Top 5
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loading ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading...</p>
          ) : filteredConversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {search.trim().length > 0
                ? 'No matching conversations'
                : 'No conversations yet'}
            </p>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 pt-1 text-[10px] font-semibold uppercase text-muted-foreground">
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
