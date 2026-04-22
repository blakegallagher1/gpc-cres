"use client";

import { useState } from "react";
import type { MapTrackedParcel } from "@/components/maps/mapOperatorNotebook";

interface SavedGeofence {
  id: string;
  name: string;
  parcelCount: number;
  updatedAt: string;
  color: string;
}

interface LayerItem {
  key: string;
  label: string;
  defaultOn: boolean;
}

interface LayerGroup {
  groupLabel: string;
  items: LayerItem[];
}

interface AtlasLeftRailProps {
  trackedParcels: MapTrackedParcel[];
  onTrackedParcelClick?: (parcel: MapTrackedParcel) => void;
  onPromoteToDeal?: () => void;
  onExportCsv?: () => void;
  onGeofenceClick?: (id: string) => void;
  overlayState?: Record<string, boolean>;
  onOverlayToggle?: (key: string) => void;
  savedGeofences?: SavedGeofence[];
}

const LAYER_GROUPS: LayerGroup[] = [
  {
    groupLabel: "RISK",
    items: [
      { key: "showFlood", label: "Flood zones", defaultOn: false },
      { key: "showSoils", label: "Soils", defaultOn: false },
      { key: "showWetlands", label: "Wetlands", defaultOn: false },
    ],
  },
  {
    groupLabel: "LEGAL",
    items: [
      { key: "showZoning", label: "EBR zoning districts", defaultOn: true },
      { key: "showFlu", label: "Future land use", defaultOn: false },
    ],
  },
  {
    groupLabel: "MARKET",
    items: [
      { key: "showRecentSales", label: "Recent sales", defaultOn: false },
      { key: "showNewPermits", label: "New permits", defaultOn: false },
    ],
  },
  {
    groupLabel: "COLOR",
    items: [
      { key: "showHeatmap", label: "Same-owner portfolio", defaultOn: true },
    ],
  },
  {
    groupLabel: "BASE",
    items: [
      { key: "showParcelBoundaries", label: "Parcel boundaries", defaultOn: true },
      { key: "showTerrain", label: "Terrain", defaultOn: false },
    ],
  },
];

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-[14px] py-[10px] font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-fade"
    >
      <span>{label}</span>
      <span className="transition-transform" style={{ transform: open ? "rotate(90deg)" : "" }}>
        ›
      </span>
    </button>
  );
}

export function AtlasLeftRail({
  trackedParcels,
  onTrackedParcelClick,
  onPromoteToDeal,
  onExportCsv,
  onGeofenceClick,
  overlayState = {},
  onOverlayToggle,
  savedGeofences = [],
}: AtlasLeftRailProps) {
  const [trackedOpen, setTrackedOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper-soft">
      {/* ── TRACKED WORKING SET ── */}
      <div className="border-b border-rule">
        <SectionHeader
          label={`TRACKED · ${trackedParcels.length}`}
          open={trackedOpen}
          onToggle={() => setTrackedOpen((v) => !v)}
        />
        {trackedOpen && (
          <div className="px-[10px] pb-[10px]">
            {trackedParcels.length === 0 ? (
              <p className="px-2 py-3 font-sans text-[11px] italic text-ink-fade">
                No parcels tracked yet.
              </p>
            ) : (
              trackedParcels.map((p) => (
                <button
                  key={p.parcelId}
                  type="button"
                  onClick={() => onTrackedParcelClick?.(p)}
                  className="mb-[3px] w-full rounded-[3px] px-[10px] py-[9px] text-left hover:bg-paper-panel"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[12.5px] font-medium text-ink line-clamp-1">
                      {p.address}
                    </span>
                    {p.status && (
                      <span className="ml-2 shrink-0 font-mono text-[10px] text-ink-fade">
                        {p.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-fade">
                    {p.currentZoning && <span>{p.currentZoning}</span>}
                    {p.acreage != null && (
                      <>
                        <span>·</span>
                        <span>{Number(p.acreage).toFixed(1)} ac</span>
                      </>
                    )}
                    {p.note && (
                      <>
                        <span>·</span>
                        <span className="italic text-ink-soft">{p.note}</span>
                      </>
                    )}
                  </div>
                </button>
              ))
            )}

            {trackedParcels.length > 0 && (
              <div className="mt-2 flex gap-2 px-[10px]">
                <button
                  type="button"
                  onClick={onPromoteToDeal}
                  className="flex-1 rounded-[3px] bg-ink px-3 py-1.5 font-sans text-[11px] font-medium text-paper-panel"
                >
                  Promote to deal ▸
                </button>
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="rounded-[3px] border border-rule bg-paper-panel px-3 py-1.5 font-sans text-[11px] text-ink-soft hover:text-ink"
                >
                  Export .csv
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SAVED GEOFENCES ── */}
      <div className="border-b border-rule">
        <SectionHeader
          label={`SAVED GEOFENCES · ${savedGeofences.length}`}
          open={true}
          onToggle={() => undefined}
        />
        <div className="px-[10px] pb-[10px]">
          {savedGeofences.length === 0 ? (
            <p className="px-2 py-3 font-sans text-[11px] italic text-ink-fade">
              No saved geofences.
            </p>
          ) : (
            savedGeofences.map((gf) => (
              <button
                key={gf.id}
                type="button"
                onClick={() => onGeofenceClick?.(gf.id)}
                className="mb-[3px] flex w-full items-center gap-2 rounded-[3px] px-[10px] py-[9px] text-left hover:bg-paper-panel"
              >
                <span
                  className="h-[24px] w-[8px] shrink-0 rounded-[2px]"
                  style={{ backgroundColor: gf.color }}
                />
                <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-ink">
                  {gf.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-ink-fade">
                  {gf.parcelCount} · {gf.updatedAt}
                </span>
                <span className="text-ink-fade">→</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── LAYERS & OVERLAYS ── */}
      <div>
        <SectionHeader
          label="LAYERS & OVERLAYS"
          open={layersOpen}
          onToggle={() => setLayersOpen((v) => !v)}
        />
        {layersOpen && (
          <div className="px-[14px] pb-[12px]">
            {LAYER_GROUPS.map((group) => (
              <div key={group.groupLabel} className="mb-3">
                <p className="mb-1 font-mono text-[9px] tracking-[0.14em] text-ink-fade">
                  {group.groupLabel}
                </p>
                {group.items.map((item) => {
                  const on =
                    overlayState[item.key] !== undefined
                      ? overlayState[item.key]
                      : item.defaultOn;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onOverlayToggle?.(item.key)}
                      className="mb-1 flex w-full items-center gap-2 rounded-[2px] py-[3px]"
                    >
                      <span
                        className={`flex h-[12px] w-[12px] shrink-0 items-center justify-center rounded-[2px] border ${
                          on
                            ? "border-ink bg-ink"
                            : "border-rule bg-paper-panel"
                        }`}
                      >
                        {on && (
                          <span className="h-[5px] w-[5px] rounded-[1px] bg-paper-panel" />
                        )}
                      </span>
                      <span className="font-sans text-[12px] text-ink">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
