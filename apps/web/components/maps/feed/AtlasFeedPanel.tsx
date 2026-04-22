'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AtlasResultsFeed } from './AtlasResultsFeed';
import { AtlasScreeningPanel } from './AtlasScreeningPanel';
import { AtlasOwnerPanel } from './AtlasOwnerPanel';

// ---------------------------------------------------------------------------
// Shared types — exported so Agent 1 can import them if needed
// ---------------------------------------------------------------------------

export type SelectedParcelData = {
  id: string;
  code?: string;
  name?: string;
  addr?: string;
  owner?: string;
  ownerSince?: string;
  acres?: number;
  zoning?: string;
  ask?: string;
  score?: number;
  screening?: Record<string, { state: string; label: string; note: string }>;
  ownerMeta?: string;
  portfolio?: Array<{ addr: string; zoning: string; acres: number; note: string }>;
  contacts?: Array<{ key: string; value: string }>;
};

export type QueryResult = {
  id: string;
  kind: string;
  q: string;
  t: string;
  answer: string;
  stats?: Array<{ k: string; v: string }>;
  rows?: Array<{ owner: string; parcels: number; acres: number }>;
  narrative?: string;
};

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type AtlasTab = 'results' | 'screening' | 'owner';

// ---------------------------------------------------------------------------
// AtlasFeedPanel
// ---------------------------------------------------------------------------

export function AtlasFeedPanel(props: {
  tab: AtlasTab;
  onTabChange: (tab: AtlasTab) => void;
  selectedParcel: SelectedParcelData | null;
  results: QueryResult[];
  suggestions: string[];
  onPlotOnMap?: (resultId: string) => void;
  onSuggestionClick?: (prompt: string) => void;
  onDispatchScreening?: () => void;
}): React.JSX.Element {
  const {
    tab,
    onTabChange,
    selectedParcel,
    results,
    suggestions,
    onPlotOnMap,
    onSuggestionClick,
    onDispatchScreening,
  } = props;

  const tabs: Array<{ id: AtlasTab; label: string }> = [
    { id: 'results', label: `Results · ${results.length}` },
    { id: 'screening', label: 'Screening' },
    { id: 'owner', label: 'Owner' },
  ];

  return (
    <div
      className="flex min-h-0 flex-col border-l border-rule bg-paper-panel"
      style={{ width: '360px' }}
    >
      {/* Tab row */}
      <div className="flex shrink-0 border-b border-rule">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              'flex-1 px-2 py-[11px] font-sans text-[12px] transition-colors',
              tab === t.id
                ? 'border-b-2 border-ink font-semibold text-ink'
                : 'text-ink-fade hover:text-ink-soft',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body — must fill remaining height */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'results' && (
          <AtlasResultsFeed
            results={results}
            suggestions={suggestions}
            onPlotOnMap={onPlotOnMap}
            onSuggestionClick={onSuggestionClick}
          />
        )}
        {tab === 'screening' && (
          <AtlasScreeningPanel
            parcel={selectedParcel}
            onDispatchScreening={onDispatchScreening}
          />
        )}
        {tab === 'owner' && (
          <AtlasOwnerPanel parcel={selectedParcel} />
        )}
      </div>
    </div>
  );
}
