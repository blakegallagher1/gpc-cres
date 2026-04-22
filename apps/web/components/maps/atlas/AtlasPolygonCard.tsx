"use client";

interface ZoningRow {
  code: string;
  count: number;
  acres: number;
}

interface AtlasPolygonCardProps {
  title?: string;
  parcelCount: number;
  totalAcres: number;
  ownerCount: number;
  zoningRows?: ZoningRow[];
  onClose?: () => void;
  onScreenAll?: () => void;
  onSaveGeofence?: () => void;
}

export function AtlasPolygonCard({
  title = "Selected Polygon",
  parcelCount,
  totalAcres,
  ownerCount,
  zoningRows = [],
  onClose,
  onScreenAll,
  onSaveGeofence,
}: AtlasPolygonCardProps) {
  return (
    <div
      className="absolute z-30 w-[280px] overflow-hidden rounded-[4px] border border-ed-accent bg-paper-panel"
      style={{
        right: 24,
        top: 80,
        boxShadow: "0 4px 18px rgba(20,20,20,0.10)",
      }}
      role="region"
      aria-label="Polygon prospect summary"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-ed-accent bg-ed-accent-soft px-[14px] py-[11px]">
        <div>
          <p className="font-mono text-[9.5px] font-semibold tracking-[0.14em] text-ed-accent">
            POLYGON · PROSPECT
          </p>
          <h3 className="font-display text-[14px] font-semibold text-ink">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close polygon card"
          className="ml-2 mt-0.5 shrink-0 text-ink-fade hover:text-ink"
        >
          ✕
        </button>
      </div>

      {/* Stats 3-col grid */}
      <div className="grid grid-cols-3 border-b border-rule px-[14px] py-[12px]">
        {(
          [
            { key: "Parcels", value: parcelCount },
            { key: "Acres", value: totalAcres.toFixed(1) },
            { key: "Owners", value: ownerCount },
          ] as const
        ).map((stat) => (
          <div key={stat.key} className="text-center">
            <p className="font-mono text-[9px] tracking-[0.1em] text-ink-fade">
              {stat.key}
            </p>
            <p className="font-display text-[17px] font-semibold text-ink">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Zoning rows */}
      {zoningRows.length > 0 && (
        <div className="border-b border-rule px-[14px] py-[10px]">
          <div className="grid grid-cols-3 gap-[1px]">
            {/* Header row */}
            <span className="font-mono text-[9px] tracking-[0.1em] text-ink-fade">ZONE</span>
            <span className="font-mono text-[9px] tracking-[0.1em] text-ink-fade">PARCELS</span>
            <span className="font-mono text-[9px] tracking-[0.1em] text-ink-fade">ACRES</span>
            {zoningRows.map((row) => (
              <>
                <span
                  key={`${row.code}-code`}
                  className="border-t border-dashed border-rule py-[3px] font-mono text-[11px] text-ink"
                >
                  {row.code}
                </span>
                <span
                  key={`${row.code}-count`}
                  className="border-t border-dashed border-rule py-[3px] font-mono text-[11px] text-ink"
                >
                  {row.count}
                </span>
                <span
                  key={`${row.code}-acres`}
                  className="border-t border-dashed border-rule py-[3px] font-mono text-[11px] text-ink"
                >
                  {row.acres.toFixed(1)}
                </span>
              </>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 px-[14px] py-[12px]">
        <button
          type="button"
          onClick={onScreenAll}
          className="flex-1 rounded-[3px] bg-ed-accent px-3 py-2 font-sans text-[12px] font-medium text-white hover:opacity-90"
        >
          Screen all ▸
        </button>
        <button
          type="button"
          onClick={onSaveGeofence}
          className="rounded-[3px] border border-rule bg-transparent px-3 py-2 font-sans text-[12px] text-ink-soft hover:text-ink"
        >
          Save as geofence
        </button>
      </div>
    </div>
  );
}
