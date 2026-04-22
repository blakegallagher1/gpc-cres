"use client";

interface AtlasHudProps {
  cursor?: { lat: number; lng: number } | null;
  bbox?: { west: number; south: number; east: number; north: number } | null;
  zoom?: number | null;
}

function fmtCoord(v: number, decimals = 5) {
  return v.toFixed(decimals);
}

function fmtBbox(
  bbox: { west: number; south: number; east: number; north: number },
) {
  return `${fmtCoord(bbox.west, 3)}, ${fmtCoord(bbox.south, 3)} → ${fmtCoord(bbox.east, 3)}, ${fmtCoord(bbox.north, 3)}`;
}

const CELL_CLS =
  "flex items-baseline gap-[6px] border-r border-rule px-[12px] py-[6px] shrink-0";
const KEY_CLS = "font-mono text-[9px] tracking-[0.14em] text-ink-fade";
const VAL_CLS = "font-mono text-[11px] text-ink";

export function AtlasHud({ cursor, bbox, zoom }: AtlasHudProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center border-t border-rule"
      style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(6px)" }}
    >
      {/* Cursor */}
      <div className={CELL_CLS}>
        <span className={KEY_CLS}>CURSOR</span>
        <span className={VAL_CLS}>
          {cursor
            ? `${fmtCoord(cursor.lat)}, ${fmtCoord(cursor.lng)}`
            : "—"}
        </span>
      </div>

      {/* BBOX */}
      <div className={CELL_CLS}>
        <span className={KEY_CLS}>BBOX</span>
        <span className={`${VAL_CLS} hidden md:block`}>
          {bbox ? fmtBbox(bbox) : "—"}
        </span>
      </div>

      {/* Zoom */}
      <div className={CELL_CLS}>
        <span className={KEY_CLS}>Z</span>
        <span className={VAL_CLS}>
          {zoom != null ? zoom.toFixed(1) : "—"}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Kbd hints */}
      <div className="hidden items-center gap-3 px-[14px] py-[6px] md:flex">
        {(
          [
            { key: "V", label: "select" },
            { key: "L", label: "lasso" },
            { key: "[", label: "rail" },
            { key: "⌘K", label: "palette" },
          ] as const
        ).map((hint) => (
          <span
            key={hint.key}
            className="font-mono text-[10px] text-ink-fade"
          >
            <span className="rounded-[2px] border border-rule bg-paper-inset px-1 py-0.5 text-ink-soft">
              {hint.key}
            </span>{" "}
            {hint.label}
          </span>
        ))}
      </div>
    </div>
  );
}
