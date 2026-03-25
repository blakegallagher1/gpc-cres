"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Crosshair,
  ListTodo,
  MapPinned,
  Radar,
  Rows3,
  Target,
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
  activePanel: "chat" | "prospecting" | null;
  onActivePanelChange: (panel: "chat" | "prospecting") => void;
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

function MetricCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-map-border bg-map-surface/55 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="map-stat-label">{label}</p>
        <span className="text-map-text-muted">{icon}</span>
      </div>
      <div className="mt-1.5 map-stat-value">{value}</div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-xs font-semibold text-map-text-primary">{title}</h3>
      <p className="mt-1 text-[11px] leading-5 text-map-text-secondary">{body}</p>
    </div>
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
  activePanel,
  onActivePanelChange,
  onFocusParcel,
  onToggleParcel,
  onClearSelection,
  onSaveSelection,
  onFocusTrackedParcel,
  onRemoveTrackedParcel,
  onUpdateTrackedParcelStatus,
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
        ? "Update tracked parcel"
        : "Track highlighted parcel"
      : `Track ${selectedParcels.length} highlighted parcels`;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-map-border bg-map-surface-overlay/95 backdrop-blur-xl",
        className,
      )}
    >
      <div className="border-b border-map-border px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
              Map console
            </p>
            <h2 className="mt-1 text-sm font-semibold text-map-text-primary">
              Run analysis, pin parcel boundaries, and manage follow-up work.
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-map-text-secondary">
              Tracked parcels stay highlighted on the map while their notes and task state stay attached.
            </p>
          </div>
          <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
            {trackedSummary.openCount} open tasks
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MetricCell label="In View" value={visibleCount} icon={<Target className="h-3.5 w-3.5" />} />
          <MetricCell label="Selected" value={selectedParcels.length} icon={<Crosshair className="h-3.5 w-3.5" />} />
          <MetricCell label="Tracked" value={trackedSummary.totalCount} icon={<MapPinned className="h-3.5 w-3.5" />} />
          <MetricCell label="Analyses" value={resultCount} icon={<Radar className="h-3.5 w-3.5" />} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-map-text-muted">
          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
            {sourceLabel}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
            Freshness: {dataFreshnessLabel}
          </Badge>
          <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
            Latency: {latencyLabel}
          </Badge>
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
              <section className="space-y-3">
                <SectionHeader
                  eyebrow="Workflow lane"
                  title="Bring the right map tool forward."
                  body="Switch between parcel analysis and polygon prospecting without leaving the active geography."
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onActivePanelChange("chat")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors",
                      activePanel === "chat"
                        ? "border-map-accent bg-map-accent-surface text-map-text-primary"
                        : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <Bot className="h-4 w-4" />
                      Map copilot
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                      Ask for site pressure, zoning patterns, and follow-up analysis.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivePanelChange("prospecting")}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors",
                      activePanel === "prospecting"
                        ? "border-map-accent bg-map-accent-surface text-map-text-primary"
                        : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <Radar className="h-4 w-4" />
                      Prospecting
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                      Filter a drawn polygon and tighten the shortlist.
                    </p>
                  </button>
                </div>
              </section>

              <Separator className="bg-map-border" />

              <section className="space-y-3">
                <SectionHeader
                  eyebrow="Selection notebook"
                  title="Capture what matters while the boundary stays lit."
                  body="Save a task and note against the highlighted parcel set. Saving here pins those parcels in the notebook."
                />
                <div className="grid grid-cols-3 gap-2">
                  <MetricCell
                    label="Matches"
                    value={searchMatchCount}
                    icon={<Rows3 className="h-3.5 w-3.5" />}
                  />
                  <MetricCell
                    label="Nearby"
                    value={nearbyCount}
                    icon={<Target className="h-3.5 w-3.5" />}
                  />
                  <MetricCell
                    label="Blocked"
                    value={trackedSummary.blockedCount}
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  />
                </div>
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
                      Select parcels from the map or parcel table, then attach a task or note here.
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
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] leading-4 text-map-text-muted">
                        Saving pins the parcel boundary in the notebook until you remove it.
                      </p>
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
                </div>
              </section>

              <AnimatePresence initial={false}>
                {selectedParcels.length === 1 ? (
                  <motion.section
                    key="selection-brief"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={TAB_TRANSITION}
                    className="space-y-3"
                  >
                    <SectionHeader
                      eyebrow="Selection brief"
                      title="Run the parcel screen before you advance it."
                      body="The screening stack gives you a quick constraint read before the parcel moves deeper into the queue."
                    />
                    <div className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-3">
                      <ScreeningScorecard parcelId={selectedParcels[0]?.id ?? null} />
                    </div>
                  </motion.section>
                ) : null}
              </AnimatePresence>

              <Separator className="bg-map-border" />

              <section className="space-y-3">
                <SectionHeader
                  eyebrow="Tracked parcels"
                  title="Use the notebook as the active follow-up queue."
                  body="Focus an entry to jump back to the map, revise the note, or mark the task complete."
                />
                {trackedParcels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[11px] leading-5 text-map-text-muted">
                    No tracked parcels yet. Save a note from the current selection to keep that parcel boundary highlighted.
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
                              Focus / revise
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
                              {complete ? "Reopen" : "Mark complete"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onRemoveTrackedParcel(entry.parcelId)}
                              className="h-7 border-map-border bg-map-surface px-2.5 text-[10px] text-map-text-secondary hover:bg-map-surface-elevated hover:text-map-text-primary"
                            >
                              <Trash2 className="mr-1.5 h-3 w-3" />
                              Remove
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
              <SectionHeader
                eyebrow="Analyst table"
                title="Work the parcel set directly."
                body="Filter, sort, and multi-select parcels from the current live geography without leaving the console."
              />
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
