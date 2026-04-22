'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SelectedParcelData } from './AtlasFeedPanel';

interface AtlasOwnerPanelProps {
  parcel: SelectedParcelData | null;
}

export function AtlasOwnerPanel({ parcel }: AtlasOwnerPanelProps) {
  if (!parcel) {
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 pb-5 pt-[14px]">
          <p className="text-[12px] text-ink-fade italic">
            Select a parcel on the map to view owner data.
          </p>
        </div>
      </ScrollArea>
    );
  }

  const portfolio = parcel.portfolio ?? [];
  const contacts = parcel.contacts ?? [];

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-4 pb-5 pt-[14px]">
        {/* Hero */}
        <div className="mb-3 border-b border-rule pb-3">
          <p className="font-mono text-[10px] tracking-[0.14em] text-ink-fade uppercase">
            Current Owner
          </p>
          <h2 className="mt-[3px] font-display text-[18px] font-semibold tracking-[-0.01em] text-ink leading-tight">
            {parcel.owner ?? '—'}
          </h2>
          {parcel.ownerMeta && (
            <p className="mt-[3px] text-[11.5px] text-ink-fade">{parcel.ownerMeta}</p>
          )}
        </div>

        {/* Portfolio list */}
        {portfolio.length > 0 && (
          <section className="mb-4">
            <p className="mb-2 font-mono text-[9.5px] tracking-[0.14em] text-ink-fade uppercase">
              Same-Owner Portfolio · {portfolio.length}
            </p>
            <div className="flex flex-col">
              {portfolio.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid gap-2 py-[6px] text-[11.5px]',
                    i < portfolio.length - 1 &&
                      'border-b border-dashed border-rule',
                  )}
                  style={{ gridTemplateColumns: '1.3fr auto auto 1fr' }}
                >
                  <span className="font-medium text-ink truncate" title={item.addr}>
                    {item.addr}
                  </span>
                  <span className="self-center font-mono text-[10px] tracking-[0.08em] border border-rule bg-paper-inset px-[5px] py-px text-ink-soft whitespace-nowrap">
                    {item.zoning}
                  </span>
                  <span className="self-center font-mono text-[10.5px] text-ink-soft text-right whitespace-nowrap">
                    {item.acres.toFixed(1)} ac
                  </span>
                  <span className="self-center text-[10.5px] italic text-ink-fade truncate">
                    {item.note}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact trace */}
        {contacts.length > 0 && (
          <section>
            <p className="mb-2 font-mono text-[9.5px] tracking-[0.14em] text-ink-fade uppercase">
              Contact Trace
            </p>
            <div className="flex flex-col">
              {contacts.map((contact, i) => (
                <div
                  key={i}
                  className={cn(
                    'grid gap-2 py-[5px] text-[11.5px]',
                    i < contacts.length - 1 &&
                      'border-b border-dashed border-rule',
                  )}
                  style={{ gridTemplateColumns: '120px 1fr' }}
                >
                  <span className="font-mono text-[10px] tracking-[0.06em] text-ink-fade self-start pt-px">
                    {contact.key}
                  </span>
                  <span className="text-ink leading-snug">{contact.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {portfolio.length === 0 && contacts.length === 0 && (
          <p className="text-[12px] text-ink-fade italic">
            No portfolio or contact data available for this owner.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
