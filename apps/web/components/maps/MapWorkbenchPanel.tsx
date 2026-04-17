"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  Camera,
  ChevronDown,
  ChevronLeft,
  Layers,
  Maximize2,
  Pencil,
  Route,
  Ruler,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SavedGeofences } from "./SavedGeofences";
import { HEATMAP_PRESETS } from "./heatmapPresets";
import type { HeatmapPresetKey, MapWorkbenchPreset } from "./types";
import { cn } from "@/lib/utils";

const PANEL_TRANSITION = { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const };
const WORKBENCH_WIDTH_CLASS = "w-[23rem] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-5.5rem)]";

interface MapWorkbenchPanelProps {
  open: boolean;
  searchSlot?: ReactNode;
  baseLayer: string;
  onBaseLayerChange: (value: string) => void;
  activePreset: MapWorkbenchPreset | null;
  onApplyPreset: (preset: MapWorkbenchPreset) => void;
  geometryStatusLabel: string | null;
  showParcelBoundaries: boolean;
  setShowParcelBoundaries: (value: boolean) => void;
  showZoning: boolean;
  setShowZoning: (value: boolean) => void;
  showFlu?: boolean;
  setShowFlu?: (value: boolean) => void;
  showFlood: boolean;
  setShowFlood: (value: boolean) => void;
  showSoils: boolean;
  setShowSoils: (value: boolean) => void;
  showWetlands: boolean;
  setShowWetlands: (value: boolean) => void;
  showEpa: boolean;
  setShowEpa: (value: boolean) => void;
  showMobileHomePark: boolean;
  setShowMobileHomePark: (value: boolean) => void;
  showRecentSales: boolean;
  setShowRecentSales: (value: boolean) => void;
  showNewPermits: boolean;
  setShowNewPermits: (value: boolean) => void;
  showZoningChanges: boolean;
  setShowZoningChanges: (value: boolean) => void;
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
  dataFreshnessLabel?: string;
  latencyLabel?: string;
}

interface LayerActionButtonProps {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}

function LayerActionButton({
  active,
  title,
  description,
  onClick,
}: LayerActionButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "group flex min-h-[4.25rem] w-full flex-col rounded-2xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-map-accent bg-map-accent/12 text-map-text-primary"
          : "border-map-border/70 bg-map-surface/45 text-map-text-secondary hover:border-map-accent-muted hover:bg-map-surface",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium">
        <span>{title}</span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
            active
              ? "border-map-accent bg-map-accent text-white"
              : "border-map-border text-map-text-muted group-hover:text-map-text-secondary",
          )}
        >
          {active ? "On" : "Off"}
        </span>
      </span>
      <span className="mt-1 text-[10px] leading-4 text-map-text-muted">{description}</span>
    </button>
  );
}

interface LayerPresetButtonProps {
  preset: MapWorkbenchPreset;
  activePreset: MapWorkbenchPreset | null;
  label: string;
  description: string;
  onClick: (preset: MapWorkbenchPreset) => void;
}

function LayerPresetButton({
  preset,
  activePreset,
  label,
  description,
  onClick,
}: LayerPresetButtonProps) {
  const active = activePreset === preset;

  return (
    <button
      type="button"
      onClick={() => onClick(preset)}
      className={cn(
        "flex min-h-[4.7rem] flex-col rounded-2xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-map-accent bg-map-accent/12 text-map-text-primary"
          : "border-map-border/70 bg-map-surface/45 text-map-text-secondary hover:border-map-accent-muted hover:bg-map-surface",
      )}
    >
      <span className="text-[11px] font-medium">{label}</span>
      <span className="mt-1 text-[10px] leading-4 text-map-text-muted">{description}</span>
    </button>
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
        "inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-[11px] font-medium transition-colors",
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

function EmptyWorkflowState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-map-border/80 bg-map-surface/35 px-4 py-4">
      <p className="text-[11px] font-medium text-map-text-primary">{title}</p>
      <p className="mt-1 text-[10px] leading-5 text-map-text-muted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

type WorkflowSectionKey =
  | "search"
  | "working-set"
  | "display"
  | "references"
  | "analysis"
  | "measure-draw"
  | "geofences"
  | "help";

type WorkflowSectionState = Record<WorkflowSectionKey, boolean>;

interface WorkflowSectionProps {
  id: WorkflowSectionKey;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  badge?: ReactNode;
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  children: ReactNode;
}

function WorkflowSection({
  id,
  eyebrow,
  title,
  description,
  icon,
  badge,
  open,
  onOpenChange,
  children,
}: WorkflowSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section className="border-b border-map-border/80 px-4 py-3 last:border-b-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-2xl px-1 py-1 text-left transition-colors hover:bg-map-surface/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-map-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-map-surface-overlay"
            aria-controls={`map-workbench-section-${id}`}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-map-border/70 bg-map-surface/60 text-map-text-primary">
              {icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                  {eyebrow}
                </span>
                {badge}
              </span>
              <span className="mt-1 block text-[12px] font-semibold text-map-text-primary">
                {title}
              </span>
              <span className="mt-1 block text-[10px] leading-5 text-map-text-secondary">
                {description}
              </span>
            </span>
            <span
              className={cn(
                "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-map-border/70 bg-map-surface/50 text-map-text-muted transition-transform duration-200",
                open ? "rotate-180" : "rotate-0",
              )}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={`map-workbench-section-${id}`} className="pt-3">
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

export function MapWorkbenchPanel({
  open,
  searchSlot,
  baseLayer,
  onBaseLayerChange,
  activePreset,
  onApplyPreset,
  geometryStatusLabel,
  showParcelBoundaries,
  setShowParcelBoundaries,
  showZoning,
  setShowZoning,
  showFlu,
  setShowFlu,
  showFlood,
  setShowFlood,
  showSoils,
  setShowSoils,
  showWetlands,
  setShowWetlands,
  showEpa,
  setShowEpa,
  showMobileHomePark,
  setShowMobileHomePark,
  showRecentSales,
  setShowRecentSales,
  showNewPermits,
  setShowNewPermits,
  showZoningChanges,
  setShowZoningChanges,
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
  dataFreshnessLabel,
  latencyLabel,
}: MapWorkbenchPanelProps) {
  const reduceMotion = useReducedMotion();
  const overlayCount = [
    showParcelBoundaries,
    showZoning,
    showFlood,
    showSoils,
    showWetlands,
    showEpa,
    showMobileHomePark,
    showRecentSales,
    showNewPermits,
    showZoningChanges,
    showComps,
    showHeatmap,
    showIsochrone,
  ].filter(Boolean).length;
  const activeReferenceLayers = [
    showParcelBoundaries ? "Parcels" : null,
    showZoning ? "Zoning" : null,
    showFlood ? "Flood" : null,
    showSoils ? "Soils" : null,
    showWetlands ? "Wetlands" : null,
    showEpa ? "EPA" : null,
  ].filter((value): value is string => value !== null);
  const activeAnalysisLayers = [
    showComps ? "Comps" : null,
    showHeatmap ? "Heatmap" : null,
    showIsochrone ? "Drive time" : null,
  ].filter((value): value is string => value !== null);
  const actionableCount = overlayCount + (selectedCount > 0 ? 1 : 0) + (hasPolygon ? 1 : 0);
  const workbenchTooltip = useMemo(() => {
    const details = [
      overlayCount > 0 ? `${overlayCount} active layer${overlayCount === 1 ? "" : "s"}` : null,
      selectedCount > 0
        ? `${selectedCount} selected parcel${selectedCount === 1 ? "" : "s"}`
        : null,
      hasPolygon ? "boundary live" : null,
    ].filter((value): value is string => value !== null);

    return details.length > 0 ? details.join(" • ") : "Open the map workbench";
  }, [hasPolygon, overlayCount, selectedCount]);
  const [sectionState, setSectionState] = useState<WorkflowSectionState>({
    search: true,
    "working-set": true,
    display: true,
    references: false,
    analysis: false,
    "measure-draw": false,
    geofences: false,
    help: false,
  });

  useEffect(() => {
    if (!open) return;
    setSectionState((current) => ({
      ...current,
      "working-set": current["working-set"] || selectedCount > 0 || hasPolygon,
      references: current.references || activeReferenceLayers.length > 1,
      analysis:
        current.analysis ||
        showComps ||
        showHeatmap ||
        showIsochrone ||
        selectedCount > 0,
    }));
  }, [
    activeReferenceLayers.length,
    hasPolygon,
    open,
    selectedCount,
    showComps,
    showHeatmap,
    showIsochrone,
  ]);

  const updateSection = (section: WorkflowSectionKey) => (nextOpen: boolean) => {
    setSectionState((current) => ({
      ...current,
      [section]: nextOpen,
    }));
  };

  return (
    <div className="pointer-events-none absolute inset-y-3 left-3 z-20 flex items-start gap-3">
      <TooltipProvider delayDuration={120}>
        <div className="pointer-events-auto flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onToggleOpen}
                className={cn(
                  "relative h-11 w-11 border-map-border bg-map-surface-overlay shadow-lg transition-all",
                  open
                    ? "text-map-text-primary hover:bg-map-surface"
                    : "text-map-accent hover:bg-map-surface hover:text-map-accent",
                )}
                title={open ? "Collapse workbench (L)" : "Open workbench (L)"}
                aria-label={open ? "Collapse map workbench" : "Open map workbench"}
                aria-expanded={open}
              >
                {open ? <ChevronLeft className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                {!open && actionableCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-map-accent px-1 text-[9px] font-bold leading-none text-white shadow-md">
                    {actionableCount}
                  </span>
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[16rem]">
              {open ? "Collapse the map workbench." : workbenchTooltip}
            </TooltipContent>
          </Tooltip>
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
      </TooltipProvider>

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
              "pointer-events-auto flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-map-border bg-map-surface-overlay shadow-2xl backdrop-blur-xl",
              WORKBENCH_WIDTH_CLASS,
            )}
          >
            <div className="border-b border-map-border px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-map-text-muted">
                    Geography workbench
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-map-text-primary">
                    Run the geography workflow from one panel.
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-map-text-secondary">
                    Search, build the working set, tune layers, and move into analysis without breaking map focus.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
                    {selectedCount} selected
                  </Badge>
                  <span className="text-[10px] text-map-text-muted">
                    {hasPolygon ? "Boundary live" : `${baseLayer} base`}
                  </span>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <WorkflowSection
                id="search"
                eyebrow="Search"
                title="Find the parcel or place first."
                description="Use parcel lookup to move the map, then refine the display once the target geography is locked."
                icon={<Search className="h-4 w-4" />}
                badge={
                  <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                    Entry point
                  </Badge>
                }
                open={sectionState.search}
                onOpenChange={updateSection("search")}
              >
                {searchSlot ? (
                  searchSlot
                ) : (
                  <EmptyWorkflowState
                    title="Parcel lookup is unavailable."
                    description="Reload the map to restore address, parcel, and owner search."
                  />
                )}
              </WorkflowSection>

              <WorkflowSection
                id="working-set"
                eyebrow="Working set"
                title="Keep the active geography explicit."
                description="Selection, boundary state, and compare readiness live together here."
                icon={<Layers className="h-4 w-4" />}
                badge={
                  <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                    {selectedCount > 0 ? `${selectedCount} active` : "Empty"}
                  </Badge>
                }
                open={sectionState["working-set"]}
                onOpenChange={updateSection("working-set")}
              >
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded-2xl border border-map-border/70 bg-map-surface/45 px-3 py-3">
                    <p className="text-map-text-muted">Selected</p>
                    <p className="mt-1 text-lg font-semibold text-map-text-primary">{selectedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-map-border/70 bg-map-surface/45 px-3 py-3">
                    <p className="text-map-text-muted">Boundary</p>
                    <p className="mt-1 text-sm font-semibold text-map-text-primary">
                      {hasPolygon ? "Live" : "None"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-map-border/70 bg-map-surface/45 px-3 py-3">
                    <p className="text-map-text-muted">Layers</p>
                    <p className="mt-1 text-sm font-semibold text-map-text-primary">{overlayCount}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedCount < 2}
                    onClick={onOpenCompare}
                    className="h-8 border-map-border bg-map-surface/45 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Compare selected parcels
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!hasPolygon}
                    onClick={onClearPolygon}
                    className="h-8 border-map-border bg-map-surface/45 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Clear active boundary
                  </Button>
                </div>
                {selectedCount === 0 && !hasPolygon ? (
                  <div className="mt-3">
                    <EmptyWorkflowState
                      title="No working set yet."
                      description="Search for a parcel or draw a boundary to create the geography you want to analyze."
                    />
                  </div>
                ) : null}
              </WorkflowSection>

              <WorkflowSection
                id="display"
                eyebrow="Display"
                title="Choose the cleanest base for the task."
                description="Switch between streets, satellite, and dark before layering on additional context."
                icon={<Camera className="h-4 w-4" />}
                badge={
                  geometryStatusLabel ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                      {geometryStatusLabel}
                    </Badge>
                  ) : undefined
                }
                open={sectionState.display}
                onOpenChange={updateSection("display")}
              >
                <ToggleGroup
                  type="single"
                  value={baseLayer}
                  onValueChange={(value: string) => value && onBaseLayerChange(value)}
                  className="grid w-full grid-cols-3 gap-2 rounded-xl border-0 bg-transparent p-0"
                >
                  {["Streets", "Satellite", "Dark"].map((option) => (
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
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <LayerPresetButton
                    preset="parcel-focus"
                    activePreset={activePreset}
                    label="Parcel focus"
                    description="Clear the extra references and keep parcel geometry leading."
                    onClick={onApplyPreset}
                  />
                  <LayerPresetButton
                    preset="reset"
                    activePreset={activePreset}
                    label="Reset display"
                    description="Return to the default streets stack for a fresh pass."
                    onClick={onApplyPreset}
                  />
                </div>
              </WorkflowSection>

              <WorkflowSection
                id="references"
                eyebrow="References"
                title="Activate only the supporting layers you need."
                description="Reference overlays should answer the current question without overwhelming the canvas."
                icon={<Layers className="h-4 w-4" />}
                badge={<Badge variant="outline" className="px-2 py-0.5 text-[9px]">{overlayCount} live</Badge>}
                open={sectionState.references}
                onOpenChange={updateSection("references")}
              >
                <div className="grid grid-cols-2 gap-2">
                  <LayerActionButton
                    active={showParcelBoundaries}
                    title="Parcels"
                    description="Boundaries, fills, and point fallback markers."
                    onClick={() => setShowParcelBoundaries(!showParcelBoundaries)}
                  />
                  <LayerActionButton
                    active={showZoning}
                    title="Zoning"
                    description="Parcel zoning fills for code-pressure scans."
                    onClick={() => setShowZoning(!showZoning)}
                  />
                  {setShowFlu && (
                    <LayerActionButton
                      active={Boolean(showFlu)}
                      title="Future land use"
                      description="FLU overlay — identifies upzone-ready parcels (requires per-parish tile source)."
                      onClick={() => setShowFlu(!showFlu)}
                    />
                  )}
                  <LayerActionButton
                    active={showFlood}
                    title="Flood zones"
                    description="Flood exposure context from FEMA overlays."
                    onClick={() => setShowFlood(!showFlood)}
                  />
                  <LayerActionButton
                    active={showSoils}
                    title="Soils"
                    description="Soil suitability context for site screening."
                    onClick={() => setShowSoils(!showSoils)}
                  />
                  <LayerActionButton
                    active={showWetlands}
                    title="Wetlands"
                    description="Wetland constraints for entitlement risk."
                    onClick={() => setShowWetlands(!showWetlands)}
                  />
                  <LayerActionButton
                    active={showEpa}
                    title="EPA facilities"
                    description="Nearby environmental flags and regulated sites."
                    onClick={() => setShowEpa(!showEpa)}
                  />
                  <LayerActionButton
                    active={showMobileHomePark}
                    title="Mobile home parks"
                    description="Mobile home park locations and communities."
                    onClick={() => setShowMobileHomePark(!showMobileHomePark)}
                  />
                </div>
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-map-text-muted">
                    What Changed (12 mo)
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <LayerActionButton
                      active={showRecentSales}
                      title="Recent Sales"
                      description="Parcels that sold in the last 12 months."
                      onClick={() => setShowRecentSales(!showRecentSales)}
                    />
                    <LayerActionButton
                      active={showNewPermits}
                      title="New Permits"
                      description="New building permits issued in the last 12 months."
                      onClick={() => setShowNewPermits(!showNewPermits)}
                    />
                    <LayerActionButton
                      active={showZoningChanges}
                      title="Zoning Changes"
                      description="Parcels with zoning classification changes in the last 12 months."
                      onClick={() => setShowZoningChanges(!showZoningChanges)}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPreset("full-stack")}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Full stack
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPreset("zoning-scan")}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Zoning scan
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPreset("environmental")}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Environmental
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeReferenceLayers.length > 0 ? (
                    activeReferenceLayers.map((label) => (
                      <Badge key={label} variant="outline" className="px-2 py-0.5 text-[9px]">
                        {label}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                      No reference layers active
                    </Badge>
                  )}
                </div>
              </WorkflowSection>

              {showTools ? (
                <WorkflowSection
                  id="analysis"
                  eyebrow="Analysis"
                  title="Enable only the analytical overlays that support the current screen."
                  description="Comps, heatmaps, and drive-time should sharpen the decision instead of crowding the view."
                  icon={<Sparkles className="h-4 w-4" />}
                  badge={
                    <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                      {activeAnalysisLayers.length} active
                    </Badge>
                  }
                  open={sectionState.analysis}
                  onOpenChange={updateSection("analysis")}
                >
                  <div className="grid grid-cols-2 gap-2">
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
                        className="grid w-full grid-cols-2 gap-2 rounded-xl border-0 bg-transparent p-0"
                      >
                        {HEATMAP_PRESETS.map((preset) => (
                          <ToggleGroupItem
                            key={preset.key}
                            value={preset.key}
                            variant="outline"
                            size="sm"
                            aria-label={preset.label}
                            title={preset.label}
                            className="justify-start rounded-xl border-map-border bg-map-surface/55 px-3 text-[10px] text-map-text-secondary data-[state=on]:border-map-accent data-[state=on]:bg-map-accent data-[state=on]:text-white"
                          >
                            {preset.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  ) : null}
                  {selectedCount > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onOpenCompare}
                      className="mt-3 h-8 w-full border-map-border bg-map-surface/45 text-[10px] text-map-text-primary hover:bg-map-surface"
                    >
                      Open compare sheet
                    </Button>
                  ) : (
                    <div className="mt-3">
                      <EmptyWorkflowState
                        title="Comparison opens when you have a set."
                        description="Select at least two parcels to unlock the compare sheet from this analysis section."
                      />
                    </div>
                  )}
                </WorkflowSection>
              ) : null}

              <WorkflowSection
                id="measure-draw"
                eyebrow="Measure / Draw"
                title="Trace boundaries and validate scale."
                description="Switch into draw or measure mode only when you need it, then clear it quickly."
                icon={<Pencil className="h-4 w-4" />}
                badge={<Badge variant="outline" className="px-2 py-0.5 text-[9px]">{drawState.badge}</Badge>}
                open={sectionState["measure-draw"]}
                onOpenChange={updateSection("measure-draw")}
              >
                <div className="grid grid-cols-2 gap-2">
                  <ToolButton
                    active={drawing}
                    label={drawing ? "Finish boundary" : "Draw boundary"}
                    onClick={onToggleDrawing}
                    icon={<Pencil className="h-4 w-4" />}
                  />
                  <ToolButton
                    active={measureMode !== "off"}
                    label={measureMode === "off" ? "Measure" : `Measuring ${measureMode}`}
                    onClick={() => setMeasureMode(measureMode === "distance" ? "off" : "distance")}
                    icon={<Ruler className="h-4 w-4" />}
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
                      setMeasureMode((value as "off" | "distance" | "area" | "") || "off")
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
                <p className="mt-3 text-[10px] leading-5 text-map-text-secondary">{drawState.hint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onUndoDraw}
                    disabled={!drawing}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Undo point
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onCancelDraw}
                    disabled={!drawing}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Cancel draw
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onClearPolygon}
                    disabled={!hasPolygon}
                    className="h-7 border-map-border bg-map-surface/45 px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    Clear boundary
                  </Button>
                </div>
              </WorkflowSection>

              <WorkflowSection
                id="geofences"
                eyebrow="Geofences"
                title="Reuse named polygons for repeat scans."
                description="Saved boundaries should feel like reusable workflow assets, not a dead-end list."
                icon={<Route className="h-4 w-4" />}
                badge={<Badge variant="outline" className="px-2 py-0.5 text-[9px]">{polygon ? "Draft live" : "Ready"}</Badge>}
                open={sectionState.geofences}
                onOpenChange={updateSection("geofences")}
              >
                {onPolygonDrawn ? (
                  <SavedGeofences currentPolygon={polygon} onApply={onPolygonDrawn} />
                ) : (
                  <EmptyWorkflowState
                    title="Saved geofences are unavailable here."
                    description="Open the full map workspace to save or apply geofences against the live boundary tools."
                  />
                )}
              </WorkflowSection>

              <WorkflowSection
                id="help"
                eyebrow="Help"
                title="Keep the workspace moving."
                description="Shortcuts, exports, and state telemetry stay here when you need a quick reminder."
                icon={<BookOpenText className="h-4 w-4" />}
                badge={<Badge variant="secondary" className="px-2 py-0.5 text-[9px]">L / D / S / F</Badge>}
                open={sectionState.help}
                onOpenChange={updateSection("help")}
              >
                <div className="grid grid-cols-2 gap-2 text-[10px] text-map-text-secondary">
                  <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                    <p className="font-medium text-map-text-primary">L</p>
                    <p className="mt-1">Toggle the workbench.</p>
                  </div>
                  <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                    <p className="font-medium text-map-text-primary">D</p>
                    <p className="mt-1">Start or finish polygon drawing.</p>
                  </div>
                  <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                    <p className="font-medium text-map-text-primary">S</p>
                    <p className="mt-1">Export a screenshot.</p>
                  </div>
                  <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                    <p className="font-medium text-map-text-primary">F</p>
                    <p className="mt-1">Toggle fullscreen mode.</p>
                  </div>
                </div>

                <Separator className="my-4 bg-map-border/70" />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onScreenshot}
                    className="h-8 border-map-border bg-map-surface/45 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    Screenshot
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onToggleFullscreen}
                    className="h-8 border-map-border bg-map-surface/45 text-[10px] text-map-text-primary hover:bg-map-surface"
                  >
                    <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                    Fullscreen
                  </Button>
                </div>

                {(dataFreshnessLabel || latencyLabel) ? (
                  <div className="mt-4 grid gap-2 text-[10px] text-map-text-secondary">
                    {dataFreshnessLabel ? (
                      <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                        <p className="font-medium text-map-text-primary">Data freshness</p>
                        <p className="mt-1">{dataFreshnessLabel}</p>
                      </div>
                    ) : null}
                    {latencyLabel ? (
                      <div className="rounded-xl border border-map-border/70 bg-map-surface/45 px-3 py-2">
                        <p className="font-medium text-map-text-primary">Response latency</p>
                        <p className="mt-1">{latencyLabel}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyWorkflowState
                      title="No extra telemetry is shown right now."
                      description="The map is live. Turn on development diagnostics only when you need deeper timing or freshness detail."
                    />
                  </div>
                )}
              </WorkflowSection>
            </ScrollArea>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
