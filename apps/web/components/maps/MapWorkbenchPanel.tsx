"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pencil,
  Route,
  Ruler,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SavedGeofences } from "./SavedGeofences";
import { HEATMAP_PRESETS } from "./heatmapPresets";
import type { HeatmapPresetKey } from "./types";
import { cn } from "@/lib/utils";

const PANEL_TRANSITION = { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const };
const WORKBENCH_WIDTH_CLASS = "w-[22rem] max-w-[calc(100vw-5.5rem)]";

interface MapWorkbenchPanelProps {
  open: boolean;
  searchSlot?: ReactNode;
  baseLayer: string;
  onBaseLayerChange: (value: string) => void;
  geometryStatusLabel: string | null;
  showParcelBoundaries: boolean;
  setShowParcelBoundaries: (value: boolean) => void;
  showZoning: boolean;
  setShowZoning: (value: boolean) => void;
  showFlood: boolean;
  setShowFlood: (value: boolean) => void;
  showSoils: boolean;
  setShowSoils: (value: boolean) => void;
  showWetlands: boolean;
  setShowWetlands: (value: boolean) => void;
  showEpa: boolean;
  setShowEpa: (value: boolean) => void;
  showTools: boolean;
  showComps: boolean;
  setShowComps: (value: boolean | ((value: boolean) => boolean)) => void;
  showHeatmap: boolean;
  setShowHeatmap: (value: boolean | ((value: boolean) => boolean)) => void;
  activeHeatmapPreset: HeatmapPresetKey;
  setActiveHeatmapPreset: (key: HeatmapPresetKey) => void;
  showIsochrone: boolean;
  setShowIsochrone: (value: boolean | ((value: boolean) => boolean)) => void;
  measureMode: "off" | "distance" | "area";
  setMeasureMode: (mode: "off" | "distance" | "area") => void;
  drawing: boolean;
  hasPolygon: boolean;
  drawState: {
    label: string;
    badge: string;
    hint: string;
  };
  selectedCount: number;
  onToggleOpen: () => void;
  onScreenshot: () => void;
  onToggleFullscreen: () => void;
  onToggleDrawing: () => void;
  onUndoDraw: () => void;
  onCancelDraw: () => void;
  onClearPolygon: () => void;
  polygon: number[][][] | null;
  onPolygonDrawn?: (coordinates: number[][][]) => void;
  onOpenCompare: () => void;
}

interface OverlayToggleRowProps {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}

function OverlayToggleRow({
  checked,
  label,
  description,
  onChange,
}: OverlayToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-map-border/60 bg-map-surface/55 px-3 py-2.5 transition-colors hover:border-map-accent-muted hover:bg-map-surface">
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-map-text-primary">{label}</div>
        {description ? (
          <div className="mt-1 text-[10px] leading-4 text-map-text-muted">{description}</div>
        ) : null}
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5 border-map-accent"
      />
    </label>
  );
}

interface ToolButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}

function ToolButton({ active, label, onClick, icon }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-medium transition-colors",
        active
          ? "border-map-accent bg-map-accent text-white"
          : "border-map-border bg-map-surface/55 text-map-text-secondary hover:border-map-accent-muted hover:bg-map-surface hover:text-map-text-primary",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function MapWorkbenchPanel({
  open,
  searchSlot,
  baseLayer,
  onBaseLayerChange,
  geometryStatusLabel,
  showParcelBoundaries,
  setShowParcelBoundaries,
  showZoning,
  setShowZoning,
  showFlood,
  setShowFlood,
  showSoils,
  setShowSoils,
  showWetlands,
  setShowWetlands,
  showEpa,
  setShowEpa,
  showTools,
  showComps,
  setShowComps,
  showHeatmap,
  setShowHeatmap,
  activeHeatmapPreset,
  setActiveHeatmapPreset,
  showIsochrone,
  setShowIsochrone,
  measureMode,
  setMeasureMode,
  drawing,
  hasPolygon,
  drawState,
  selectedCount,
  onToggleOpen,
  onScreenshot,
  onToggleFullscreen,
  onToggleDrawing,
  onUndoDraw,
  onCancelDraw,
  onClearPolygon,
  polygon,
  onPolygonDrawn,
  onOpenCompare,
}: MapWorkbenchPanelProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute left-3 top-3 bottom-12 z-20 flex items-start gap-3">
      <div className="pointer-events-auto flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleOpen}
          className="h-11 w-11 border-map-border bg-map-surface-overlay text-map-text-primary shadow-lg hover:bg-map-surface"
          title={open ? "Collapse workbench (L)" : "Open workbench (L)"}
          aria-label={open ? "Collapse map workbench" : "Open map workbench"}
          aria-expanded={open}
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onScreenshot}
          className="h-10 w-10 border-map-border bg-map-surface-overlay text-map-text-primary shadow-lg hover:bg-map-surface"
          title="Export screenshot (S)"
          aria-label="Export map screenshot"
        >
          <Camera className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleFullscreen}
          className="h-10 w-10 border-map-border bg-map-surface-overlay text-map-text-primary shadow-lg hover:bg-map-surface"
          title="Toggle fullscreen (F)"
          aria-label="Toggle map fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside
            key="map-workbench"
            data-tour="layers-panel"
            initial={reduceMotion ? false : { opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -18 }}
            transition={PANEL_TRANSITION}
            className={cn(
              "pointer-events-auto flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-map-border bg-map-surface-overlay shadow-2xl backdrop-blur-xl",
              WORKBENCH_WIDTH_CLASS,
            )}
          >
            <div className="border-b border-map-border px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-map-text-muted">
                    Map workbench
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-map-text-primary">
                    Shape the active geography.
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-map-text-secondary">
                    Search parcels, tune overlays, and run geography tools without leaving the canvas.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
                    {selectedCount} selected
                  </Badge>
                  <span className="text-[10px] text-map-text-muted">
                    {hasPolygon ? "Polygon live" : `${baseLayer} base`}
                  </span>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {searchSlot ? (
                <section className="border-b border-map-border px-4 py-4">{searchSlot}</section>
              ) : null}

              <section className="border-b border-map-border px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                      Display
                    </p>
                    <h3 className="mt-1 text-xs font-semibold text-map-text-primary">
                      Base map and parcel overlays
                    </h3>
                  </div>
                  {geometryStatusLabel ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                      {geometryStatusLabel}
                    </Badge>
                  ) : null}
                </div>

                <ToggleGroup
                  type="single"
                  value={baseLayer}
                  onValueChange={(value: string) => value && onBaseLayerChange(value)}
                  className="mt-3 grid w-full grid-cols-2 gap-2 rounded-xl border-0 bg-transparent p-0"
                >
                  {["Streets", "Satellite"].map((option) => (
                    <ToggleGroupItem
                      key={option}
                      value={option}
                      variant="outline"
                      aria-label={option}
                      title={option}
                      className="rounded-xl border-map-border bg-map-surface/55 text-[11px] text-map-text-secondary data-[state=on]:border-map-accent data-[state=on]:bg-map-accent data-[state=on]:text-white"
                    >
                      {option}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>

                <div className="mt-3 flex flex-col gap-2">
                  <OverlayToggleRow
                    checked={showParcelBoundaries}
                    label="Parcels"
                    description="Boundary fills, outlines, and point fallback markers."
                    onChange={setShowParcelBoundaries}
                  />
                  <OverlayToggleRow
                    checked={showZoning}
                    label="Zoning"
                    description="Parcel zoning fills for quick code-pressure scans."
                    onChange={setShowZoning}
                  />
                  <OverlayToggleRow
                    checked={showFlood}
                    label="Flood zones"
                    description="FEMA flood overlays and flood exposure context."
                    onChange={setShowFlood}
                  />
                  <OverlayToggleRow
                    checked={showSoils}
                    label="Soils"
                    description="Soil suitability layers for site screening."
                    onChange={setShowSoils}
                  />
                  <OverlayToggleRow
                    checked={showWetlands}
                    label="Wetlands"
                    description="Wetland constraint view for entitlement risk."
                    onChange={setShowWetlands}
                  />
                  <OverlayToggleRow
                    checked={showEpa}
                    label="EPA facilities"
                    description="Nearby EPA-regulated sites and environmental flags."
                    onChange={setShowEpa}
                  />
                </div>
              </section>

              {showTools ? (
                <section data-tour="analytical-toolbar" className="border-b border-map-border px-4 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                    Analysis
                  </p>
                  <h3 className="mt-1 text-xs font-semibold text-map-text-primary">
                    Turn on working tools only when you need them.
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ToolButton
                      active={showComps}
                      label="Comparable sales"
                      onClick={() => setShowComps((value) => !value)}
                      icon={<Sparkles className="h-4 w-4" />}
                    />
                    <ToolButton
                      active={showHeatmap}
                      label="Heatmap"
                      onClick={() => setShowHeatmap((value) => !value)}
                      icon={<Sparkles className="h-4 w-4" />}
                    />
                    <ToolButton
                      active={showIsochrone}
                      label="Drive time"
                      onClick={() => setShowIsochrone((value) => !value)}
                      icon={<Route className="h-4 w-4" />}
                    />
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-map-text-muted">
                      Measure mode
                    </p>
                    <ToggleGroup
                      type="single"
                      value={measureMode}
                      onValueChange={(value: string) =>
                        setMeasureMode(
                          (value as "off" | "distance" | "area" | "") || "off",
                        )
                      }
                      className="grid w-full grid-cols-3 gap-2 rounded-xl border-0 bg-transparent p-0"
                    >
                      <ToggleGroupItem value="off" variant="outline" size="sm" className="text-[10px]" aria-label="Off" title="Off">
                        Off
                      </ToggleGroupItem>
                      <ToggleGroupItem value="distance" variant="outline" size="sm" className="text-[10px]" aria-label="Distance" title="Distance">
                        <Ruler className="mr-1 h-3.5 w-3.5" />
                        Distance
                      </ToggleGroupItem>
                      <ToggleGroupItem value="area" variant="outline" size="sm" className="text-[10px]" aria-label="Area" title="Area">
                        Area
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {showHeatmap ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-map-text-muted">
                        Heatmap preset
                      </p>
                      <ToggleGroup
                        type="single"
                        value={activeHeatmapPreset}
                        onValueChange={(value: string) =>
                          value && setActiveHeatmapPreset(value as HeatmapPresetKey)
                        }
                        className="flex w-full flex-wrap justify-start gap-2 rounded-xl border-0 bg-transparent p-0"
                      >
                        {HEATMAP_PRESETS.map((preset) => (
                          <ToggleGroupItem
                            key={preset.key}
                            value={preset.key}
                            variant="outline"
                            size="sm"
                            aria-label={preset.label}
                            title={preset.label}
                            className="rounded-full border-map-border bg-map-surface/55 text-[10px] text-map-text-secondary data-[state=on]:border-map-accent data-[state=on]:bg-map-accent data-[state=on]:text-white"
                          >
                            {preset.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {showTools ? (
                <section data-tour="draw-tool" className="border-b border-map-border px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                        {drawState.label}
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-map-text-secondary">
                        {drawState.hint}
                      </p>
                    </div>
                    <Badge variant="outline" className="px-2 py-1 text-[9px]">
                      {drawState.badge}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!hasPolygon ? (
                      <Button
                        type="button"
                        size="sm"
                        title="Draw polygon search area"
                        onClick={onToggleDrawing}
                        className={cn(
                          "h-8 gap-1.5 px-3 text-[10px] font-medium",
                          drawing
                            ? "border-map-accent bg-map-accent text-white hover:bg-map-accent/90"
                            : "border-map-border bg-map-surface/55 text-map-text-primary hover:bg-map-surface",
                        )}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {drawing ? "Finish area" : "Start draw"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        title="Clear polygon"
                        onClick={onClearPolygon}
                        className="h-8 gap-1.5 border-map-accent bg-map-accent px-3 text-[10px] font-medium text-white hover:bg-map-accent/90"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear area
                      </Button>
                    )}
                    {drawing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          title="Undo last point (Cmd/Ctrl+Z)"
                          onClick={onUndoDraw}
                          className="h-8 border-map-border px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                        >
                          Undo
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          title="Cancel drawing"
                          onClick={onCancelDraw}
                          className="h-8 gap-1 border-map-border px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {showTools && onPolygonDrawn ? (
                <section data-tour="geofences" className="border-b border-map-border px-4 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                    Geofences
                  </p>
                  <h3 className="mt-1 text-xs font-semibold text-map-text-primary">
                    Save repeat search areas and reapply them instantly.
                  </h3>
                  <div className="mt-3">
                    <SavedGeofences currentPolygon={polygon} onApply={onPolygonDrawn} />
                  </div>
                </section>
              ) : null}

              {selectedCount > 0 ? (
                <section className="px-4 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                    Selection
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-map-border bg-map-surface/55 px-3 py-3">
                    <div>
                      <p className="text-[11px] font-medium text-map-text-primary">
                        {selectedCount} parcel{selectedCount === 1 ? "" : "s"} active
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                        Use the current selection for screening, comparison, or a copilot follow-up.
                      </p>
                    </div>
                    {selectedCount >= 2 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={onOpenCompare}
                        className="border-map-accent bg-map-accent px-3 py-2 text-[10px] font-medium text-white hover:bg-map-accent/90"
                      >
                        Compare
                      </Button>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </ScrollArea>

            <Separator className="bg-map-border" />
            <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-map-text-muted">
              <span>
                <kbd className="rounded border border-map-border px-1">L</kbd> Panel
              </span>
              <span>
                <kbd className="rounded border border-map-border px-1">D</kbd> Draw
              </span>
              <span>
                <kbd className="rounded border border-map-border px-1">F</kbd> Full
              </span>
              <span>
                <kbd className="rounded border border-map-border px-1">S</kbd> Snap
              </span>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
