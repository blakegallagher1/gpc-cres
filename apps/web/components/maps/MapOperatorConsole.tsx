"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  Crosshair,
  ListTodo,
  Radar,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MapInvestorPanels } from "./MapInvestorPanels";
import { MapParcelDataGrid } from "./MapParcelDataGrid";
import { ScreeningScorecard } from "./ScreeningScorecard";
import {
  MAP_TRACKED_PARCEL_STATUSES,
  mapTrackedParcelStatusLabel,
  summarizeTrackedParcels,
  type MapTrackedParcel,
  type MapTrackedParcelDraft,
  type MapTrackedParcelStatus,
} from "./mapOperatorNotebook";
import type { MapParcel } from "./types";
import type {
  MapAssemblageSnapshot,
  MapCompsSnapshot,
  MapMarketOverlaySnapshot,
  MapOwnershipSnapshot,
  MapWorkspaceSnapshot,
} from "./useMapInvestorWorkbench";

const TAB_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

interface MapOperatorConsoleProps {
  parcels: MapParcel[];
  selectedIds: Set<string>;
  selectedParcels: MapParcel[];
  trackedParcels: MapTrackedParcel[];
  visibleCount: number;
  searchMatchCount: number;
  nearbyCount: number;
  resultCount: number;
  statusText: string;
  sourceLabel: string;
  dataFreshnessLabel: string;
  latencyLabel: string;
  workspace: MapWorkspaceSnapshot;
  assemblage: MapAssemblageSnapshot;
  ownership: MapOwnershipSnapshot;
  comps: MapCompsSnapshot;
  marketOverlays: MapMarketOverlaySnapshot;
  activePanel: "chat" | "prospecting" | null;
  onActivePanelChange: (panel: "chat" | "prospecting" | null) => void;
  onFocusParcel: (parcel: MapParcel) => void;
  onToggleParcel: (parcelId: string) => void;
  onClearSelection: () => void;
  onSaveSelection: (draft: MapTrackedParcelDraft) => void;
  onFocusTrackedParcel: (entry: MapTrackedParcel) => void;
  onRemoveTrackedParcel: (parcelId: string) => void;
  onUpdateTrackedParcelStatus: (
    parcelId: string,
    status: MapTrackedParcelStatus,
  ) => void;
  onHighlightOwnerParcels?: (ownerName: string) => void;
  className?: string;
}

function getTrackedStatusClass(status: MapTrackedParcelStatus): string {
  switch (status) {
    case "to_analyze":
      return "border-map-border bg-map-surface text-map-text-secondary";
    case "active":
      return "border-emerald-500/35 bg-emerald-500/12 text-emerald-200";
    case "blocked":
      return "border-amber-500/35 bg-amber-500/12 text-amber-200";
    case "complete":
      return "border-sky-500/35 bg-sky-500/12 text-sky-200";
  }
}

function formatTrackedMeta(entry: MapTrackedParcel): string[] {
  return [
    entry.currentZoning ? `Zone ${entry.currentZoning}` : null,
    entry.acreage != null ? `${entry.acreage.toFixed(2)} ac` : null,
    entry.floodZone ? `Flood ${entry.floodZone}` : null,
  ].filter((value): value is string => value !== null);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
      {children}
    </p>
  );
}

/**
 * Dense operator console for `/map` workflows, including tracked parcel notes, task states, and the
 * embedded parcel analyst table.
 */
export function MapOperatorConsole({
  parcels,
  selectedIds,
  selectedParcels,
  trackedParcels,
  visibleCount,
  searchMatchCount,
  nearbyCount,
  resultCount,
  statusText,
  sourceLabel,
  dataFreshnessLabel,
  latencyLabel,
  workspace,
  assemblage,
  ownership,
  comps,
  marketOverlays,
  activePanel,
  onActivePanelChange,
  onFocusParcel,
  onToggleParcel,
  onClearSelection,
  onSaveSelection,
  onFocusTrackedParcel,
  onRemoveTrackedParcel,
  onUpdateTrackedParcelStatus,
  onHighlightOwnerParcels,
  className,
}: MapOperatorConsoleProps) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<"operate" | "parcels">("operate");
  const trackedSummary = useMemo(
    () => summarizeTrackedParcels(trackedParcels),
    [trackedParcels],
  );
  const trackedById = useMemo(
    () => new Map(trackedParcels.map((entry) => [entry.parcelId, entry])),
    [trackedParcels],
  );
  const selectionKey = useMemo(
    () => selectedParcels.map((parcel) => parcel.id).join(":"),
    [selectedParcels],
  );
  const [taskDraft, setTaskDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [statusDraft, setStatusDraft] =
    useState<MapTrackedParcelStatus>("to_analyze");

  useEffect(() => {
    if (selectedParcels.length === 1) {
      const existing = trackedById.get(selectedParcels[0].id);
      setTaskDraft(existing?.task ?? "");
      setNoteDraft(existing?.note ?? "");
      setStatusDraft(existing?.status ?? "to_analyze");
      return;
    }

    if (selectedParcels.length > 1) {
      setTaskDraft("");
      setNoteDraft("");
      setStatusDraft("to_analyze");
      return;
    }

    setTaskDraft("");
    setNoteDraft("");
    setStatusDraft("to_analyze");
  }, [selectionKey, selectedParcels, trackedById]);

  const ownershipIntel = useMemo(() => {
    if (selectedParcels.length !== 1) return null;
    const selected = selectedParcels[0];
    const ownerName = selected.owner;
    if (!ownerName) return null;

    const holdings = parcels.filter((p) => p.owner === ownerName);
    const totalAcres = holdings.reduce(
      (sum, p) => sum + (p.acreage ?? 0),
      0,
    );

    return {
      ownerName,
      holdingCount: holdings.length,
      totalAcres: totalAcres.toFixed(2),
    };
  }, [selectedParcels, parcels]);

  const selectedTrackedCount = selectedParcels.reduce(
    (count, parcel) => count + (trackedById.has(parcel.id) ? 1 : 0),
    0,
  );
  const canSaveSelection =
    selectedParcels.length > 0 &&
    (
      taskDraft.trim().length > 0 ||
      noteDraft.trim().length > 0 ||
      selectedTrackedCount > 0
    );
  const saveLabel =
    selectedParcels.length <= 1
      ? selectedTrackedCount > 0
        ? "Update workspace parcel"
        : "Save to workspace"
      : `Save ${selectedParcels.length} parcels to workspace`;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-map-border bg-map-surface-overlay/95 backdrop-blur-xl",
        className,
      )}
    >
      <div className="border-b border-map-border px-4 py-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-map-text-muted">
              Operator console
            </p>
            <h3 className="text-sm font-semibold text-map-text-primary">
              Save the geography, assign the next move, and keep the parcel brief live.
            </h3>
            <p className="text-[11px] leading-5 text-map-text-secondary">
              Move from selection to a shared workspace, comparison, prospecting, or copilot without
              leaving the active map state.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 border-y border-map-border/80 py-3 text-[10px] sm:grid-cols-4">
            <div>
              <div className="map-stat-label">Visible</div>
              <div className="map-stat-value">{visibleCount}</div>
            </div>
            <div>
              <div className="map-stat-label">Matches</div>
              <div className="map-stat-value">{searchMatchCount}</div>
            </div>
            <div>
              <div className="map-stat-label">Workspace</div>
              <div className="map-stat-value">{trackedSummary.totalCount}</div>
            </div>
            <div>
              <div className="map-stat-label">Analyses</div>
              <div className="map-stat-value">{resultCount}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-map-text-muted">
            <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
              {sourceLabel}
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
              {dataFreshnessLabel}
            </Badge>
            <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
              {latencyLabel}
            </Badge>
            <span>{nearbyCount} nearby</span>
            {selectedParcels.length > 0 ? (
              <span className="text-map-accent">{selectedParcels.length} selected</span>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "operate" | "parcels")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-map-border px-4 pt-3">
          <TabsList className="grid w-full grid-cols-2 gap-0 rounded-none border-map-border">
            <TabsTrigger
              value="operate"
              className="min-h-9 border-b-2 border-transparent px-0 text-[11px] text-map-text-secondary data-[state=active]:border-map-accent data-[state=active]:text-map-text-primary"
            >
              Operate
            </TabsTrigger>
            <TabsTrigger
              value="parcels"
              className="min-h-9 border-b-2 border-transparent px-0 text-[11px] text-map-text-secondary data-[state=active]:border-map-accent data-[state=active]:text-map-text-primary"
            >
              Parcels
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="operate" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={TAB_TRANSITION}
              className="space-y-5 px-4 py-4"
            >
              <section className="space-y-2">
                <SectionLabel>Tools</SectionLabel>
                <p className="text-[10px] leading-4 text-map-text-muted">
                  Launch the sidecar you need without dropping the active parcel set.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onActivePanelChange(activePanel === "chat" ? null : "chat")
                    }
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
                      activePanel === "chat"
                        ? "border-map-accent bg-map-accent/10 text-map-text-primary"
                        : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
                    )}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Map copilot
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onActivePanelChange(
                        activePanel === "prospecting" ? null : "prospecting",
                      )
                    }
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
                      activePanel === "prospecting"
                        ? "border-map-accent bg-map-accent/10 text-map-text-primary"
                        : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
                    )}
                  >
                    <Radar className="h-3.5 w-3.5" />
                    Prospecting scan
                  </button>
                </div>
              </section>

              <Separator className="bg-map-border" />

              {selectedParcels.length > 0 ? (
                <section className="space-y-2">
                  <SectionLabel>Workspace draft</SectionLabel>
                  <div className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-map-text-primary">
                      {selectedParcels.length > 0
                        ? `${selectedParcels.length} parcel${selectedParcels.length === 1 ? "" : "s"} highlighted`
                        : "No parcels selected"}
                    </p>
                    {selectedParcels.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={onClearSelection}
                        className="h-7 border-map-border bg-map-surface px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface-elevated"
                      >
                        Clear selection
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                    {statusText}
                  </p>
                  {selectedParcels.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedParcels.slice(0, 6).map((parcel) => (
                        <button
                          key={parcel.id}
                          type="button"
                          onClick={() => onFocusParcel(parcel)}
                          className="rounded-full border border-map-border bg-map-surface px-2 py-1 text-[10px] text-map-text-secondary transition-colors hover:border-map-accent-muted hover:text-map-text-primary"
                        >
                          {parcel.address}
                        </button>
                      ))}
                      {selectedParcels.length > 6 ? (
                        <Badge variant="outline" className="px-2 py-1 text-[9px]">
                          +{selectedParcels.length - 6} more
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[11px] leading-5 text-map-text-muted">
                      Select parcels from the map or parcel table, then attach the next step before saving them to the shared workspace record.
                    </div>
                  )}

                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                      <Input
                        value={taskDraft}
                        onChange={(event) => setTaskDraft(event.target.value)}
                        placeholder="Task title: verify zoning path, call broker, compare sales..."
                        className="h-9 border-map-border bg-map-surface text-[11px] text-map-text-primary placeholder:text-map-text-muted"
                      />
                      <Select
                        value={statusDraft}
                        onValueChange={(value) =>
                          setStatusDraft(value as MapTrackedParcelStatus)
                        }
                      >
                        <SelectTrigger className="h-9 border-map-border bg-map-surface text-[11px] text-map-text-primary">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="border-map-border bg-map-surface-overlay text-map-text-primary">
                          {MAP_TRACKED_PARCEL_STATUSES.map((status) => (
                            <SelectItem key={status} value={status} className="text-[11px]">
                              {mapTrackedParcelStatusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Operator note: constraints, broker feedback, screening flags, next decision..."
                      rows={4}
                      className="min-h-[112px] border-map-border bg-map-surface text-[11px] leading-5 text-map-text-primary placeholder:text-map-text-muted"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        onSaveSelection({
                          task: taskDraft,
                          note: noteDraft,
                          status: statusDraft,
                        })
                      }
                      disabled={!canSaveSelection}
                      className="h-8 bg-map-accent px-3 text-[10px] font-medium text-white hover:bg-map-accent/90 disabled:opacity-40"
                    >
                      {saveLabel}
                    </Button>
                  </div>
                </div>
                </section>
              ) : null}

              <AnimatePresence initial={false}>
                {selectedParcels.length === 1 ? (
                  <motion.section
                    key="selection-brief"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={TAB_TRANSITION}
                    className="space-y-2"
                  >
                    <SectionLabel>Screening</SectionLabel>
                    <div className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-3">
                      <ScreeningScorecard parcelId={selectedParcels[0]?.id ?? null} />
                    </div>
                  </motion.section>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {ownershipIntel ? (
                  <motion.section
                    key="ownership-intel"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={TAB_TRANSITION}
                    className="space-y-2"
                  >
                    <SectionLabel>Ownership Intel</SectionLabel>
                    <div className="rounded-lg border border-map-border bg-map-surface/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-map-text-primary">{ownershipIntel.ownerName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-map-text-muted">Holdings</span>
                          <p className="text-map-text-primary font-semibold">{ownershipIntel.holdingCount} parcels</p>
                        </div>
                        <div>
                          <span className="text-map-text-muted">Total Acreage</span>
                          <p className="text-map-text-primary font-semibold">{ownershipIntel.totalAcres} ac</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-full text-[10px] border-map-border text-map-text-secondary hover:text-map-text-primary"
                        onClick={() => onHighlightOwnerParcels?.(ownershipIntel.ownerName)}
                      >
                        Show all parcels by this owner
                      </Button>
                    </div>
                  </motion.section>
                ) : null}
              </AnimatePresence>

              <Separator className="bg-map-border" />

              <MapInvestorPanels
                workspace={workspace}
                assemblage={assemblage}
                ownership={ownership}
                comps={comps}
                marketOverlays={marketOverlays}
              />

              <Separator className="bg-map-border" />

              <section className="space-y-2">
                <SectionLabel>Workspace parcels</SectionLabel>
                {trackedParcels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[11px] leading-5 text-map-text-muted">
                    No workspace parcels yet. Save the current selection to persist the parcel brief and next move into the shared record.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {trackedParcels.map((entry) => {
                      const meta = formatTrackedMeta(entry);
                      const complete = entry.status === "complete";
                      return (
                        <motion.article
                          key={entry.parcelId}
                          layout={!reduceMotion}
                          className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onFocusTrackedParcel(entry)}
                                className="truncate text-left text-[11px] font-medium text-map-text-primary hover:text-white"
                              >
                                {entry.address}
                              </button>
                              <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                                {entry.task || "No explicit task yet"}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 px-2 py-0.5 text-[9px]",
                                getTrackedStatusClass(entry.status),
                              )}
                            >
                              {mapTrackedParcelStatusLabel(entry.status)}
                            </Badge>
                          </div>

                          {meta.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {meta.map((value) => (
                                <Badge
                                  key={`${entry.parcelId}-${value}`}
                                  variant="outline"
                                  className="px-2 py-0.5 text-[9px] text-map-text-muted"
                                >
                                  {value}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          {entry.note ? (
                            <p className="mt-3 text-[11px] leading-5 text-map-text-secondary">
                              {entry.note}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onFocusTrackedParcel(entry)}
                              className="h-7 border-map-border bg-map-surface px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface-elevated"
                            >
                              <Crosshair className="mr-1.5 h-3 w-3" />
                              Open parcel brief
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                onUpdateTrackedParcelStatus(
                                  entry.parcelId,
                                  complete ? "active" : "complete",
                                )
                              }
                              className="h-7 border-map-border bg-map-surface px-2.5 text-[10px] text-map-text-primary hover:bg-map-surface-elevated"
                            >
                              {complete ? (
                                <ListTodo className="mr-1.5 h-3 w-3" />
                              ) : (
                                <CheckCircle2 className="mr-1.5 h-3 w-3" />
                              )}
                              {complete ? "Reopen task" : "Mark complete"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onRemoveTrackedParcel(entry.parcelId)}
                              className="h-7 border-map-border bg-map-surface px-2.5 text-[10px] text-map-text-secondary hover:bg-map-surface-elevated hover:text-map-text-primary"
                            >
                              <Trash2 className="mr-1.5 h-3 w-3" />
                              Remove from workspace
                            </Button>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="parcels" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={TAB_TRANSITION}
            className="flex h-full min-h-0 flex-col"
          >
            <div className="border-b border-map-border px-4 py-3">
              <SectionLabel>Parcels</SectionLabel>
            </div>
            <MapParcelDataGrid
              embedded
              parcels={parcels}
              selectedIds={selectedIds}
              onFocusParcel={onFocusParcel}
              onToggleParcel={onToggleParcel}
            />
          </motion.div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
