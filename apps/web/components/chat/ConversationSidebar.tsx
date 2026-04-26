'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
  dealNames?: Record<string, string>;
  onCompareConversations?: (conversationIds: string[]) => void;
  onConversationDeleted?: (conversationId: string) => void;
  onConversationRenamed?: (conversationId: string, newTitle: string) => void;
}

export type ConversationFilterMode = 'all' | 'deals' | 'no-deal';

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
    recentConversationIds.forEach((id, index) => byRecency.set(id, index));
    return recentSubset
      .sort(
        (a, b) =>
          (byRecency.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (byRecency.get(b.id) ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, 5);
  }

  list = [...list].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return list;
}

export function getConversationFilterCounts(conversations: ConversationSummary[]) {
  return {
    all: conversations.length,
    deals: conversations.filter((c) => Boolean(c.dealId)).length,
    'no-deal': conversations.filter((c) => !c.dealId).length,
  };
}

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
  result.sort((a, b) => a.dealName.localeCompare(b.dealName));

  const ungrouped = groups.get(null);
  if (ungrouped && ungrouped.length > 0) {
    result.push({ dealId: null, dealName: 'Ungrouped', conversations: ungrouped });
  }

  return result;
}

function formatShortDate(value: string): string {
  return formatOperatorDate(value, { month: 'short', day: 'numeric' });
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
  mobile = false,
  showCollapsedTrigger = true,
  dealNames,
  onConversationDeleted,
  onConversationRenamed,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilterMode>('all');
  const [onlyRecent, setOnlyRecent] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/chat/conversations/${deleteTargetId}`, { method: 'DELETE' });
      if (res.ok) onConversationDeleted?.(deleteTargetId);
    } catch { /* best-effort */ } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  }, [deleteTargetId, onConversationDeleted]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTargetId || !renameValue.trim()) {
      setRenameTargetId(null);
      return;
    }
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/chat/conversations/${renameTargetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      if (res.ok) onConversationRenamed?.(renameTargetId, renameValue.trim());
    } catch { /* best-effort */ } finally {
      setIsRenaming(false);
      setRenameTargetId(null);
    }
  }, [renameTargetId, renameValue, onConversationRenamed]);

  const counts = useMemo(() => getConversationFilterCounts(conversations), [conversations]);
  const filtered = useMemo(
    () =>
      filterConversations({
        conversations,
        search,
        filter,
        onlyRecent,
        recentConversationIds,
      }),
    [conversations, search, filter, onlyRecent, recentConversationIds],
  );

  const handleSelect = useCallback(
    (id: string) => {
      onConversationSelect(id);
      if (mobile) onToggle();
    },
    [onConversationSelect, mobile, onToggle],
  );

  const railContent = (
    <aside
      className={cn(
        'flex h-full min-h-0 flex-col border-r border-rule bg-paper-soft',
        mobile ? 'w-full' : 'w-[280px]',
      )}
    >
      {/* Delete confirmation banner */}
      {deleteTargetId ? (
        <div className="border-b border-ed-warn/30 bg-[oklch(var(--ed-warn-soft))] px-4 py-3">
          <p className="text-[12px] font-medium text-ink">Delete this conversation?</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">This action cannot be undone.</p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              disabled={isDeleting}
              className="h-7 rounded px-3 text-[11px]"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDeleteTargetId(null)}
              disabled={isDeleting}
              className="h-7 rounded px-3 text-[11px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="ed-eyebrow">Runs</span>
        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <Button variant="ghost" size="icon" className="size-7 rounded" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5 text-ink-fade', loading && 'animate-spin')} />
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 rounded bg-ink px-2.5 text-[12px] font-medium text-paper-panel hover:bg-ink/90"
            onClick={() => onConversationSelect(null)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> New run
          </Button>
          {!mobile && (
            <Button variant="ghost" size="icon" className="size-7 rounded" onClick={onToggle}>
              <PanelLeftClose className="h-3.5 w-3.5 text-ink-fade" />
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-fade" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter runs…"
            className="h-8 rounded border-rule bg-paper-panel pl-8 pr-8 font-sans text-[12.5px] text-ink placeholder:text-ink-fade"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-fade"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-rule px-4">
        {([
          ['all',     `Active · ${counts.all}`],
          ['deals',   `Deals · ${counts.deals}`],
          ['no-deal', `Scans · ${counts['no-deal']}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'border-b-2 px-2.5 py-2 text-[12px] transition-colors',
              filter === k
                ? 'border-ink font-semibold text-ink'
                : 'border-transparent text-ink-fade hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
        {hasRecentRecents && (
          <button
            type="button"
            onClick={() => setOnlyRecent((v) => !v)}
            className={cn(
              'ml-auto border-b-2 px-2.5 py-2 text-[12px] transition-colors',
              onlyRecent
                ? 'border-ed-accent font-semibold text-ed-accent'
                : 'border-transparent text-ink-fade hover:text-ink',
            )}
          >
            Recent
          </button>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-2">
          {loading && filtered.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="mb-1 h-16 rounded" />
            ))
          ) : filtered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="ed-eyebrow mb-2">No runs</p>
              <p className="text-[12.5px] leading-[1.5] text-ink-soft">
                Start a new run from the composer below.
              </p>
            </div>
          ) : (
            filtered.map((c) => {
              const active = activeConversationId === c.id;
              const dealName = c.dealId ? (dealNames?.[c.dealId] ?? `Deal ${c.dealId.slice(0, 8)}`) : null;

              if (renameTargetId === c.id) {
                return (
                  <div key={c.id} className="mb-1 flex items-center gap-2 rounded border border-rule bg-paper-panel px-3 py-2.5">
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void handleRenameSubmit(); }
                        if (e.key === 'Escape') setRenameTargetId(null);
                      }}
                      onBlur={() => setTimeout(() => { if (renameTargetId) setRenameTargetId(null); }, 150)}
                      placeholder="Conversation title"
                      className="h-7 flex-1 rounded border-rule text-[12.5px]"
                      disabled={isRenaming}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRenameSubmit()}
                      className="h-7 rounded bg-ink px-2.5 text-[11px] text-paper-panel"
                      disabled={isRenaming || !renameValue.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setRenameTargetId(null)}
                      className="size-7 rounded text-ink-fade"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              }

              return (
                <div key={c.id} className="group/item relative">
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    className={cn(
                      'mb-1 block w-full rounded border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-rule bg-paper-panel ed-shadow-sm'
                        : 'border-transparent hover:border-rule hover:bg-paper-panel',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      {dealName ? (
                        <span className="rounded-sm border border-ed-accent bg-ed-accent-soft px-1.5 py-px font-mono text-[9.5px] tracking-[0.06em] text-ed-accent">
                          {dealName.slice(0, 18)}
                        </span>
                      ) : (
                        <span className="rounded-sm border border-rule bg-paper-inset px-1.5 py-px font-mono text-[9.5px] tracking-[0.08em] text-ink-fade">
                          SCAN
                        </span>
                      )}
                      <span className="font-mono text-[10.5px] text-ink-fade">
                        {formatShortDate(c.updatedAt)}
                      </span>
                    </div>
                    <div className="mb-1.5 line-clamp-2 text-[13px] font-medium leading-[1.35] text-ink">
                      {c.title ?? 'Untitled run'}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-ink-fade">
                        {(c as Record<string, unknown>).messageCount as number ?? 0} turns
                      </span>
                    </div>
                  </button>

                  {/* Three-dot menu */}
                  <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/item:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                          className="size-7 rounded text-ink-fade hover:text-ink"
                          aria-label="Conversation options"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTargetId(c.id);
                            setRenameValue(c.title ?? '');
                            setTimeout(() => renameInputRef.current?.focus(), 0);
                          }}
                          className="gap-2 text-[12px]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(c.id);
                          }}
                          className="gap-2 text-[12px] text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
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
            'flex h-10 w-10 items-center justify-center text-ink-fade transition-colors hover:text-ink',
            mobile
              ? 'fixed bottom-4 left-4 z-20 rounded-full border border-rule bg-paper-panel lg:hidden'
              : 'absolute left-3 top-4 z-20 rounded',
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
              className="fixed inset-0 z-30 bg-black/60 lg:hidden"
              aria-label="Close history"
              onClick={onToggle}
            />
          ) : null}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-40 flex w-[min(20rem,calc(100vw-3.5rem))] max-w-full flex-col transition-transform duration-200 lg:hidden',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {open ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onToggle}
                className="absolute right-3 top-3 z-10 h-8 w-8 rounded bg-paper-panel text-ink-fade shadow-sm hover:text-ink"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
            {railContent}
          </div>
        </>
      ) : (
        <div
          className={cn(
            'flex h-full flex-col transition-all duration-200',
            open ? 'w-[280px]' : 'w-0 overflow-hidden',
          )}
        >
          {open && railContent}
        </div>
      )}
    </>
  );
}
