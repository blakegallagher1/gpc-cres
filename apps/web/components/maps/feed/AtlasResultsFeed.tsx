'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { QueryResult } from './AtlasFeedPanel';

interface AtlasResultsFeedProps {
  results: QueryResult[];
  suggestions: string[];
  onPlotOnMap?: (resultId: string) => void;
  onSuggestionClick?: (prompt: string) => void;
}

export function AtlasResultsFeed({
  results,
  suggestions,
  onPlotOnMap,
  onSuggestionClick,
}: AtlasResultsFeedProps) {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-4 pb-5 pt-[14px]">
        {results.length === 0 && (
          <p className="text-[12px] text-ink-fade italic">
            No results yet. Ask a question about the map.
          </p>
        )}

        {results.map((r) => (
          <ResultCard
            key={r.id}
            result={r}
            onPlotOnMap={onPlotOnMap}
          />
        ))}

        {suggestions.length > 0 && (
          <MoreQuestionsBlock
            suggestions={suggestions}
            onSuggestionClick={onSuggestionClick}
          />
        )}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Result Card
// ---------------------------------------------------------------------------

function ResultCard({
  result,
  onPlotOnMap,
}: {
  result: QueryResult;
  onPlotOnMap?: (id: string) => void;
}) {
  return (
    <div className="mb-3 rounded-[3px] border border-rule bg-paper-panel px-[14px] py-3">
      {/* Header */}
      <div className="mb-[10px] flex items-start justify-between gap-2">
        <p className="font-sans text-[12px] italic text-ink-soft leading-snug">
          {result.q}
        </p>
        <span className="shrink-0 font-mono text-[10px] text-ink-fade">{result.t}</span>
      </div>

      {/* Answer */}
      <p className="font-display text-[20px] font-semibold tracking-[-0.01em] mb-[10px] text-ink leading-tight">
        {result.answer}
      </p>

      {/* Stats grid */}
      {result.stats && result.stats.length > 0 && (
        <div
          className="mb-3 grid grid-cols-2 border border-rule bg-rule"
          style={{ gap: '1px' }}
        >
          {result.stats.map((stat) => (
            <div
              key={stat.k}
              className="bg-paper-panel px-[10px] py-[7px]"
            >
              <div className="font-mono text-[9px] tracking-[0.12em] text-ink-fade uppercase">
                {stat.k}
              </div>
              <div className="font-display text-[15px] font-semibold text-ink leading-tight">
                {stat.v}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rows table */}
      {result.rows && result.rows.length > 0 && (
        <table className="mb-3 w-full text-[11.5px] border-collapse">
          <thead>
            <tr className="border-b border-rule">
              <th className="pb-1 text-left font-mono text-[9.5px] tracking-[0.12em] text-ink-fade uppercase">
                Owner
              </th>
              <th className="pb-1 text-right font-mono text-[9.5px] tracking-[0.12em] text-ink-fade uppercase">
                Parcels
              </th>
              <th className="pb-1 text-right font-mono text-[9.5px] tracking-[0.12em] text-ink-fade uppercase">
                Acres
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'text-ink',
                  i < result.rows!.length - 1 && 'border-b border-dashed border-rule',
                )}
              >
                <td className="py-1 pr-2">{row.owner}</td>
                <td className="py-1 text-right font-mono">{row.parcels}</td>
                <td className="py-1 text-right font-mono">{row.acres.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Narrative */}
      {result.narrative && (
        <p className="mb-3 border-t border-dashed border-rule pt-[4px] text-[12.5px] leading-[1.55] text-ink-soft">
          {result.narrative}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-[5px] flex-wrap">
        <button
          type="button"
          onClick={() => onPlotOnMap?.(result.id)}
          className="rounded-sm bg-ink px-[9px] py-[5px] text-[11px] font-semibold text-paper-panel hover:opacity-90 transition-opacity"
        >
          Plot on map
        </button>
        <button
          type="button"
          className="rounded-sm border border-rule bg-paper-panel px-[9px] py-[5px] text-[11px] text-ink-soft hover:text-ink transition-colors"
        >
          Continue in chat
        </button>
        <button
          type="button"
          className="rounded-sm border border-rule bg-paper-panel px-[9px] py-[5px] text-[11px] text-ink-soft hover:text-ink transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// More Questions Block
// ---------------------------------------------------------------------------

function MoreQuestionsBlock({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: string[];
  onSuggestionClick?: (prompt: string) => void;
}) {
  return (
    <div className="mt-4 border border-rule-soft bg-paper-soft px-[14px] py-3">
      <p className="mb-2 font-mono text-[9.5px] tracking-[0.14em] text-ink-fade uppercase">
        More questions to ask
      </p>
      <div className="flex flex-col">
        {suggestions.map((prompt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSuggestionClick?.(prompt)}
            className={cn(
              'w-full py-[5px] text-left text-[12px] text-ink-soft hover:text-ink transition-colors',
              i < suggestions.length - 1 && 'border-b border-dashed border-rule-soft',
            )}
          >
            <span className="mr-1 text-ink-fade">→</span>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
