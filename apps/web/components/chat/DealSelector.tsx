'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  name: string;
  address?: string;
}

interface DealSelectorProps {
  selectedDealId?: string | null;
  onSelect: (dealId: string | null) => void;
}

const DEAL_SELECTOR_KEY = 'chat.selected.dealId';

function fallbackStorage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(DEAL_SELECTOR_KEY);
}

export function DealSelector({ selectedDealId, onSelect }: DealSelectorProps) {
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !selectedDealId) {
      const cached = fallbackStorage();
      if (cached) {
        onSelect(cached);
      }
    }
  }, [selectedDealId, onSelect]);

  useEffect(() => {
    let cancelled = false;

    async function loadDeals() {
      try {
      const response = await fetch('/api/deals');
        if (!response.ok) return;
        const payload = (await response.json()) as { deals?: { id: string; name: string; createdAt?: string; jurisdiction?: { name?: string }; address?: string }[] };
        if (cancelled) return;
        const loaded = (payload.deals ?? []).map((deal) => ({
          id: deal.id,
          name: deal.name,
          address: deal.jurisdiction?.name,
        }));
        setDeals(loaded);
      } catch {
        setDeals([]);
      }
    }

    loadDeals();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = deals.find((d) => d.id === selectedDealId);
  const visibleDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return deals;
    }

    return deals.filter((deal) =>
      deal.name.toLowerCase().includes(query) ||
      (deal.address ?? '').toLowerCase().includes(query),
    );
  }, [deals, search]);

  const handleSelect = (dealId: string | null) => {
    if (typeof window !== 'undefined') {
      if (dealId) {
        window.localStorage.setItem(DEAL_SELECTOR_KEY, dealId);
      } else {
        window.localStorage.removeItem(DEAL_SELECTOR_KEY);
      }
    }

    onSelect(dealId);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted',
          selected ? 'border-primary/30 bg-primary/5' : 'border-transparent',
        )}
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={selected ? 'font-medium' : 'text-muted-foreground'}>
          {selected ? selected.name : 'No deal scope'}
        </span>
        {selected ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(null);
            }}
            className="ml-1 rounded p-0.5 hover:bg-muted"
            aria-label="Clear deal selection"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-popover p-1 shadow-md">
            <div className="relative p-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals"
                className="w-full rounded-md border bg-muted px-8 py-1.5 text-xs placeholder:text-muted-foreground/70"
              />
            </div>

            <button
              onClick={() => handleSelect(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted',
                !selectedDealId && 'bg-muted',
              )}
            >
              <span className="text-muted-foreground">No deal scope</span>
            </button>

            {visibleDeals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => handleSelect(deal.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted',
                  selectedDealId === deal.id && 'bg-muted',
                )}
              >
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{deal.name}</p>
                  {deal.address && <p className="truncate text-xs text-muted-foreground">{deal.address}</p>}
                </div>
              </button>
            ))}

            {visibleDeals.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No deals found</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
