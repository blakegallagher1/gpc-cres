'use client';

import { useState } from 'react';
import { Building2, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  name: string;
  address?: string;
}

// Placeholder until deals API is wired
const mockDeals: Deal[] = [
  { id: 'd1', name: 'Airline Hwy Industrial', address: '10550 Airline Hwy' },
  { id: 'd2', name: 'Port Allen Warehouse', address: '450 Commerce St' },
  { id: 'd3', name: 'Perkins Rowe Flex', address: '10000 Perkins Rowe' },
];

interface DealSelectorProps {
  selectedDealId?: string | null;
  onSelect: (dealId: string | null) => void;
}

export function DealSelector({ selectedDealId, onSelect }: DealSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = mockDeals.find((d) => d.id === selectedDealId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted',
          selected ? 'border-primary/30 bg-primary/5' : 'border-transparent'
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
              onSelect(null);
              setOpen(false);
            }}
            className="ml-1 rounded p-0.5 hover:bg-muted"
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
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover p-1 shadow-md">
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted',
                !selectedDealId && 'bg-muted'
              )}
            >
              <span className="text-muted-foreground">No deal scope</span>
            </button>
            {mockDeals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => {
                  onSelect(deal.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted',
                  selectedDealId === deal.id && 'bg-muted'
                )}
              >
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{deal.name}</p>
                  {deal.address && (
                    <p className="truncate text-xs text-muted-foreground">
                      {deal.address}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
