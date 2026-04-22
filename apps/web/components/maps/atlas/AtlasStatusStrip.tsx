"use client";

interface StatusCell {
  label: string;
  value: string;
  valueClassName?: string;
}

interface AtlasStatusStripProps {
  viewportLabel?: string | null;
  parcelsText: string;
  sourceLabel: string;
  syncLabel: string;
  suggestions?: string[];
  onSuggestionClick?: (prompt: string) => void;
}

const CELL_CLS =
  "flex items-baseline gap-2 border-r border-rule px-[14px] py-[7px] shrink-0";
const KEY_CLS = "font-mono text-[9.5px] tracking-[0.14em] text-ink-fade";
const VAL_CLS = "font-sans text-[11px] text-ink";

export function AtlasStatusStrip({
  viewportLabel,
  parcelsText,
  sourceLabel,
  syncLabel,
  suggestions = [],
  onSuggestionClick,
}: AtlasStatusStripProps) {
  const cells: StatusCell[] = [
    { label: "VIEWPORT", value: viewportLabel ?? "—" },
    { label: "PARCELS", value: parcelsText },
    { label: "SOURCE", value: sourceLabel },
    { label: "SYNC", value: syncLabel, valueClassName: "text-ed-ok" },
  ];

  return (
    <div className="flex h-[30px] shrink-0 items-center border-b border-rule bg-paper-soft">
      {/* Status cells */}
      {cells.map((cell) => (
        <div key={cell.label} className={CELL_CLS}>
          <span className={KEY_CLS}>{cell.label}</span>
          <span className={`${VAL_CLS} ${cell.valueClassName ?? ""} max-w-[180px] truncate`}>
            {cell.value}
          </span>
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Suggestion chips */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 px-[14px]">
          <span className="font-mono text-[10px] tracking-[0.1em] text-ink-fade">TRY</span>
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestionClick?.(s)}
              className="rounded-[10px] border border-rule bg-paper-panel px-2 py-0.5 font-sans text-[11px] text-ink-soft hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
