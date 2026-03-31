'use client';

import { useCallback, useMemo, useState } from 'react';
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
  GitCompareArrows,
  Layers,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatOperatorDate } from '@/lib/formatters/operatorFormatters';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/lib/chat/types';
import { SavedRunListHeader } from './ChatWorkspacePrimitives';

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
  /** Map from dealId to deal name for display. If not provided, shows "Deal" badge only. */
  dealNames?: Record<string, string>;
  /** Called when user wants to compare selected conversations */
  onCompareConversations?: (conversationIds: string[]) => void;
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
  dealIdFilter,
}: {
  conversations: ConversationSummary[];
  search: string;
  filter: ConversationFilterMode;
  onlyRecent: boolean;
  recentConversationIds: string[];
  dealIdFilter?: string | null;
}): ConversationSummary[] {
  const normalized = search.trim().toLowerCase();
  let list = conversations.filter((conv) => {
    const hasDeal = Boolean(conv.dealId);
    if (filter === 'deals' && !hasDeal) return false;
    if (filter === 'no-deal' && hasDeal) return false;
    if (dealIdFilter && conv.dealId !== dealIdFilter) return false;

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

/** Extract unique deal entries from conversations */
function getUniqueDealEntries(
  conversations: ConversationSummary[],
  dealNames?: Record<string, string>,
): Array<{ dealId: string; dealName: string }> {
  const seen = new Set<string>();
  const entries: Array<{ dealId: string; dealName: string }> = [];
  for (const conv of conversations) {
    if (conv.dealId && !seen.has(conv.dealId)) {
      seen.add(conv.dealId);
      entries.push({
        dealId: conv.dealId,
        dealName: dealNames?.[conv.dealId] ?? `Deal ${conv.dealId.slice(0, 8)}`,
      });
    }
  }
  return entries.sort((a, b) => a.dealName.localeCompare(b.dealName));
}

/** Group conversations by deal */
function groupByDeal(
  conversations: ConversationSummary[],
  dealNames?: Record<string, string>,
): Array<{ dealId: string | null; dealName: string; conversations: ConversationSummary[] }> {
  const groups = new Map<string | null, ConversationSummary[]>();
  for (const conv of conversations) {
    const key = conv.dealId ?? null;
    const existing = groups.get(key);
    if (existing) {
      existing.push(conv);
    } else {
      groups.set(key, [conv]);
    }
  }

  const result: Array<{ dealId: string | null; dealName: string; conversations: ConversationSummary[] }> = [];
  for (const [dealId, convs] of groups) {
    if (dealId) {
      result.push({
        dealId,
        dealName: dealNames?.[dealId] ?? `Deal ${dealId.slice(0, 8)}`,
        conversations: convs,
      });
    }
  }
  // Sort deal groups alphabetically
  result.sort((a, b) => a.dealName.localeCompare(b.dealName));

  // Add ungrouped at the end
  const ungrouped = groups.get(null);
  if (ungrouped && ungrouped.length > 0) {
    result.push({ dealId: null, dealName: 'Ungrouped', conversations: ungrouped });
  }

  return result;
}

function ConversationListItem({
  conv,
  active,
  recent,
  onSelect,
  dealName,
  compareMode,
  compareSelected,
  onToggleCompare,
}: {
  conv: ConversationSummary;
  active: boolean;
  recent: boolean;
  onSelect: () => void;
  dealName?: string;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompare: () => void;
}) {
  return (
    <div className="relative flex items-start gap-1">
      {compareMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          className={cn(
            'mt-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] transition-all',
            compareSelected
              ? 'border-blue-400 bg-blue-500/20 text-blue-300'
              : 'border-border/60 bg-background/60 text-transparent hover:border-border hover:text-muted-foreground',
          )}
          aria-label={compareSelected ? 'Deselect for comparison' : 'Select for comparison'}
        >
          {compareSelected ? '\u2713' : ''}
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={cn(
          '!h-auto !w-full !justify-start !items-start group gap-3 rounded-[22px] border px-3.5 py-3.5 text-left transition-all duration-200',
          active
            ? 'border-foreground/14 bg-foreground/[0.05] shadow-[0_18px_45px_-40px_rgba(15,23,42,0.5)]'
            : 'border-transparent bg-transparent hover:border-border/60 hover:bg-background/78',
          compareSelected && 'ring-1 ring-blue-400/40',
        )}
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {conv.title && conv.title.trim().length > 0 ? conv.title : 'Untitled conversation'}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {conv.dealId ? 'Deal-linked scope' : 'General operator scope'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {formatShortDate(conv.updatedAt)}
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                {conv.messageCount} msgs
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {recent ? (
              <Badge variant="outline" className="rounded-full border-border/60 bg-background/80 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]">
                Recent
              </Badge>
            ) : null}
            {active ? (
              <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]">
                Active
              </Badge>
            ) : null}
            {conv.dealId ? (
              <Badge variant="secondary" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]">
                <Building2 className="h-2.5 w-2.5" />
                {dealName ?? 'Deal'}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
                General
              </span>
            )}
          </div>
        </div>
        {!conv.dealId && !recent ? (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border/80 transition-colors group-hover:bg-foreground/25" />
        ) : null}
      </Button>
    </div>
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
  dealNames,
  onCompareConversations,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'deals' | 'no-deal'>('all');
  const [onlyRecent, setOnlyRecent] = useState(false);
  const [dealIdFilter, setDealIdFilter] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelectedIds, setCompareSelectedIds] = useState<Set<string>>(new Set());
  const [groupByDealEnabled, setGroupByDealEnabled] = useState(false);

  const uniqueDeals = useMemo(
    () => getUniqueDealEntries(conversations, dealNames),
    [conversations, dealNames],
  );

  const filteredConversations = useMemo(() => {
    return filterConversations({
      conversations,
      search,
      filter,
      onlyRecent,
      recentConversationIds,
      dealIdFilter,
    });
  }, [search, conversations, filter, onlyRecent, recentConversationIds, dealIdFilter]);

  const filterCounts = useMemo(
    () => getConversationFilterCounts(conversations),
    [conversations],
  );

  const dealGroups = useMemo(() => {
    if (!groupByDealEnabled) return null;
    return groupByDeal(filteredConversations, dealNames);
  }, [filteredConversations, groupByDealEnabled, dealNames]);

  const toggleCompareId = useCallback((id: string) => {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareSelectedIds(new Set());
  }, []);

  const recentLabel =
    onlyRecent || filter !== 'all' || search.trim().length > 0
      ? 'Filtered runs'
      : 'Recent runs';
  const sortingLabel = onlyRecent ? 'Top 5 by local recency' : 'Sorted by last update';

  const getDealName = useCallback(
    (dealId: string | null): string | undefined => {
      if (!dealId) return undefined;
      return dealNames?.[dealId] ?? `Deal ${dealId.slice(0, 8)}`;
    },
    [dealNames],
  );

  const renderConversationItem = useCallback(
    (conversation: ConversationSummary) => (
      <ConversationListItem
        key={conversation.id}
        conv={conversation}
        active={conversation.id === activeConversationId}
        recent={recentConversationIds.includes(conversation.id)}
        dealName={getDealName(conversation.dealId)}
        compareMode={compareMode}
        compareSelected={compareSelectedIds.has(conversation.id)}
        onToggleCompare={() => toggleCompareId(conversation.id)}
        onSelect={() => {
          onConversationSelect(conversation.id);
          if (mobile) {
            onToggle();
          }
        }}
      />
    ),
    [
      activeConversationId,
      recentConversationIds,
      getDealName,
      compareMode,
      compareSelectedIds,
      toggleCompareId,
      onConversationSelect,
      mobile,
      onToggle,
    ],
  );

  const railContent = (
    <>
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex flex-col gap-4">
          <SavedRunListHeader
            runCount={conversations.length}
            action={(
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
                  aria-label="Start new run"
                  title="Start new run"
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
                    title="Refresh saved runs"
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
            )}
          />
          <div className="rounded-[22px] border border-border/60 bg-muted/[0.35] px-4 py-3 text-xs text-muted-foreground">
            Reopen a verified thread, search across recent work, or start a new run without leaving the desk.
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{conversations.length} saved</span>
          <span className="text-border">/</span>
          <span>{hasRecentRecents ? 'Local recents available' : 'No local recents yet'}</span>
        </div>
      </div>

      {/* Filter bar: deal dropdown + search + group toggle */}
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved runs"
            className="h-9 w-full rounded-2xl pl-9 pr-3 text-xs placeholder:text-muted-foreground/70"
            disabled={loading}
          />
        </div>

        {/* Deal filter dropdown */}
        {uniqueDeals.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={dealIdFilter ?? '__all__'}
              onValueChange={(value) => setDealIdFilter(value === '__all__' ? null : value)}
            >
              <SelectTrigger className="h-8 w-full rounded-2xl text-[11px]">
                <Building2 className="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Filter by deal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All deals</SelectItem>
                {uniqueDeals.map((entry) => (
                  <SelectItem key={entry.dealId} value={entry.dealId}>
                    {entry.dealName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={groupByDealEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setGroupByDealEnabled((v) => !v)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-medium transition-colors',
                groupByDealEnabled
                  ? 'border-foreground/20 bg-foreground text-background'
                  : 'border-border/70 text-muted-foreground hover:text-foreground',
              )}
              title="Group conversations by deal"
            >
              <Layers className="h-3 w-3" />
              Group
            </Button>
          </div>
        )}

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
                <span>Deal-linked</span>
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
            {onlyRecent ? 'Recent 5' : 'Recent runs'}
          </Button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            <span>{filteredConversations.length} shown</span>
          </div>
          <span>{sortingLabel}</span>
        </div>

        {/* Compare mode controls */}
        {onCompareConversations && (
          <div className="flex items-center justify-between">
            {!compareMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompareMode(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                <GitCompareArrows className="h-3 w-3" />
                Compare mode
              </Button>
            ) : (
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {compareSelectedIds.size} selected
                </span>
                <div className="flex items-center gap-1.5">
                  {compareSelectedIds.size >= 2 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onCompareConversations(Array.from(compareSelectedIds));
                        exitCompareMode();
                      }}
                      className="h-7 rounded-full px-2.5 text-[10px] font-medium"
                    >
                      <GitCompareArrows className="mr-1 h-3 w-3" />
                      Compare Selected
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={exitCompareMode}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Exit compare mode"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
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
            {groupByDealEnabled && dealGroups ? (
              <div className="flex flex-col gap-4">
                {dealGroups.map((group) => (
                  <div key={group.dealId ?? '__ungrouped__'}>
                    <div className="flex items-center gap-2 px-3 pb-2">
                      {group.dealId ? (
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                      ) : null}
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {group.dealName}
                      </span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                        {group.conversations.length}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.conversations.map(renderConversationItem)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {recentLabel}
                </div>
                {filteredConversations.map(renderConversationItem)}
              </div>
            )}
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
