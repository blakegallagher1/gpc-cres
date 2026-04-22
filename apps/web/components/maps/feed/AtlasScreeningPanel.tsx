'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SelectedParcelData } from './AtlasFeedPanel';

interface AtlasScreeningPanelProps {
  parcel: SelectedParcelData | null;
  onDispatchScreening?: () => void;
}

const SCREENING_CELLS: Array<{
  key: string;
  label: string;
}> = [
  { key: 'Environmental', label: 'Environmental' },
  { key: 'Zoning', label: 'Zoning' },
  { key: 'Title', label: 'Title' },
  { key: 'Traffic', label: 'Traffic' },
  { key: 'Market', label: 'Market' },
  { key: 'Access', label: 'Access' },
];

function stateDotClass(state: string): string {
  switch (state) {
    case 'ok':
    case 'pass':
      return 'bg-ed-ok';
    case 'warn':
    case 'flag':
      return 'bg-ed-warn';
    case 'fail':
    case 'red':
      return 'bg-red-600';
    default:
      return 'bg-rule';
  }
}

export function AtlasScreeningPanel({
  parcel,
  onDispatchScreening,
}: AtlasScreeningPanelProps) {
  if (!parcel) {
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 pb-5 pt-[14px]">
          <p className="text-[12px] text-ink-fade italic">
            Select a parcel on the map to view screening data.
          </p>
        </div>
      </ScrollArea>
    );
  }

  const score = parcel.score ?? 0;
  const askPerAc =
    parcel.ask && parcel.acres && parcel.acres > 0
      ? `$${Math.round(
          parseFloat(parcel.ask.replace(/[^0-9.]/g, '')) / parcel.acres,
        ).toLocaleString()}`
      : '—';

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-4 pb-5 pt-[14px]">
        {/* Hero */}
        <div className="mb-[14px] border-b border-rule pb-[14px]">
          {parcel.code && (
            <p className="font-mono text-[10.5px] tracking-[0.12em] text-ed-accent font-semibold uppercase">
              {parcel.code}
            </p>
          )}
          <h2 className="mt-[2px] font-display text-[20px] font-semibold tracking-[-0.01em] leading-[1.15] text-ink">
            {parcel.name ?? '—'}
          </h2>
          {parcel.addr && (
            <p className="mt-[2px] text-[12px] text-ink-fade">{parcel.addr}</p>
          )}

          {/* 4-col stat strip */}
          <div
            className="mt-3 grid grid-cols-4 border border-rule bg-rule"
            style={{ gap: '1px' }}
          >
            {[
              { k: 'Acres', v: parcel.acres?.toFixed(1) ?? '—' },
              { k: 'Zoning', v: parcel.zoning ?? '—' },
              { k: 'Ask', v: parcel.ask ?? '—' },
              { k: '$/ac', v: askPerAc },
            ].map((stat) => (
              <div key={stat.k} className="bg-paper-panel px-0 py-[6px] text-center">
                <div className="font-mono text-[9px] tracking-[0em] text-ink-fade uppercase">
                  {stat.k}
                </div>
                <div className="font-display text-[14px] font-semibold text-ink leading-tight">
                  {stat.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Score band */}
        <div className="mb-[14px] grid border border-ink bg-paper-soft px-[14px] py-[10px]"
          style={{ gridTemplateColumns: 'auto 1fr', gap: '14px' }}>
          <div>
            <p className="font-mono text-[9px] tracking-[0.12em] text-ink-fade uppercase">
              Screening Score
            </p>
            <p className="font-display text-[32px] font-bold tracking-[-0.03em] text-ink leading-none mt-1">
              {score}
              <span className="font-sans text-[14px] font-normal text-ink-fade">/100</span>
            </p>
          </div>
          <div className="flex items-center">
            <div className="w-full h-[6px] rounded-none bg-rule overflow-hidden">
              <div
                className="h-full bg-ink transition-all"
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Screening grid */}
        <div
          className="mb-[14px] grid grid-cols-2 border border-rule bg-rule"
          style={{ gap: '1px' }}
        >
          {SCREENING_CELLS.map((cell) => {
            const data = parcel.screening?.[cell.key];
            const state = data?.state ?? 'unknown';
            const label = data?.label ?? cell.label;
            const note = data?.note ?? '—';
            return (
              <div key={cell.key} className="bg-paper-panel px-[12px] py-[10px]">
                <div className="mb-1 flex items-center gap-[7px]">
                  <span
                    className={cn(
                      'inline-block h-2 w-2 shrink-0 rounded-full',
                      stateDotClass(state),
                    )}
                  />
                  <span className="text-[12px] font-semibold text-ink leading-none">
                    {label}
                  </span>
                </div>
                <p className="text-[11.5px] leading-[1.45] text-ink-soft">{note}</p>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-[6px]">
          <button
            type="button"
            onClick={onDispatchScreening}
            className="flex-1 rounded-sm bg-ink px-3 py-2 text-[12px] font-semibold text-paper-panel hover:opacity-90 transition-opacity text-left"
          >
            Dispatch screening run ▸
          </button>
          <button
            type="button"
            className="rounded-sm border border-rule bg-paper-panel px-3 py-2 text-[12px] text-ink-soft hover:text-ink transition-colors"
          >
            Open in deal room
          </button>
        </div>
      </div>
    </ScrollArea>
  );
}
