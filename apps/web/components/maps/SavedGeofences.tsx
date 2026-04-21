"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, BellRing, ChevronDown, ChevronUp } from "lucide-react";

type AlertCriteria = {
  newListings: boolean;
  zoningChanges: boolean;
  permitsField: boolean;
  salesRecorded: boolean;
  minAcreage?: number;
  maxAcreage?: number;
  zoningPrefix?: string;
};

const DEFAULT_ALERT_CRITERIA: AlertCriteria = {
  newListings: false,
  zoningChanges: false,
  permitsField: false,
  salesRecorded: false,
};

type SavedGeofence = {
  id: string;
  name: string;
  coordinates: number[][][];
  createdAt: string;
  alertEnabled: boolean;
  alertCriteria: AlertCriteria;
  alertLastTriggered: string | null;
};

interface SavedGeofencesProps {
  currentPolygon: number[][][] | null;
  onApply: (coordinates: number[][][]) => void;
}

const ALERT_STORAGE_KEY = "gpc-geofence-alerts";

function loadAlertConfigs(): Record<string, { alertEnabled: boolean; alertCriteria: AlertCriteria; alertLastTriggered: string | null }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, { alertEnabled: boolean; alertCriteria: AlertCriteria; alertLastTriggered: string | null }>;
  } catch {
    return {};
  }
}

function saveAlertConfigs(configs: Record<string, { alertEnabled: boolean; alertCriteria: AlertCriteria; alertLastTriggered: string | null }>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // Silently ignore storage quota errors.
  }
}

function mergeAlertData(
  items: Array<{ id: string; name: string; coordinates: number[][][]; createdAt: string }>,
): SavedGeofence[] {
  const configs = loadAlertConfigs();
  return items.map((item) => {
    const cfg = configs[item.id];
    return {
      ...item,
      alertEnabled: cfg?.alertEnabled ?? false,
      alertCriteria: cfg?.alertCriteria ?? { ...DEFAULT_ALERT_CRITERIA },
      alertLastTriggered: cfg?.alertLastTriggered ?? null,
    };
  });
}

function persistAlertForGeofence(geofence: SavedGeofence): void {
  const configs = loadAlertConfigs();
  configs[geofence.id] = {
    alertEnabled: geofence.alertEnabled,
    alertCriteria: geofence.alertCriteria,
    alertLastTriggered: geofence.alertLastTriggered,
  };
  saveAlertConfigs(configs);
}

function removeAlertForGeofence(id: string): void {
  const configs = loadAlertConfigs();
  delete configs[id];
  saveAlertConfigs(configs);
}

function getPolygonSignature(coordinates: number[][][] | null | undefined): string | null {
  if (!coordinates) return null;
  return JSON.stringify(coordinates);
}

function formatGeofenceTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Never";

  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return "Just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatGeofenceTimestamp(isoString);
}

async function getGeofenceErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  let apiMessage: string | null = null;

  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      apiMessage = payload.error.trim();
    }
  } catch {
    // Ignore JSON parse failures and fall back to status-derived messaging.
  }

  if (response.status === 401) {
    return "Sign in to load and save geofences.";
  }

  if (response.status >= 500) {
    return "Saved geofences are unavailable in this environment right now.";
  }

  return apiMessage ?? fallbackMessage;
}

function AlertCriteriaPanel({
  geofence,
  onUpdate,
}: {
  geofence: SavedGeofence;
  onUpdate: (updated: SavedGeofence) => void;
}) {
  const criteria = geofence.alertCriteria;

  const toggleCriteria = (key: keyof Pick<AlertCriteria, "newListings" | "zoningChanges" | "permitsField" | "salesRecorded">) => {
    const updated: SavedGeofence = {
      ...geofence,
      alertCriteria: { ...criteria, [key]: !criteria[key] },
    };
    onUpdate(updated);
  };

  const updateNumericField = (key: "minAcreage" | "maxAcreage", value: string) => {
    const parsed = value === "" ? undefined : Number(value);
    const numValue = parsed !== undefined && Number.isNaN(parsed) ? undefined : parsed;
    const updated: SavedGeofence = {
      ...geofence,
      alertCriteria: { ...criteria, [key]: numValue },
    };
    onUpdate(updated);
  };

  const updateZoningPrefix = (value: string) => {
    const updated: SavedGeofence = {
      ...geofence,
      alertCriteria: { ...criteria, zoningPrefix: value || undefined },
    };
    onUpdate(updated);
  };

  const checkboxItems: Array<{ key: keyof Pick<AlertCriteria, "newListings" | "zoningChanges" | "permitsField" | "salesRecorded">; label: string }> = [
    { key: "newListings", label: "New listings" },
    { key: "zoningChanges", label: "Zoning changes" },
    { key: "permitsField", label: "Permits filed" },
    { key: "salesRecorded", label: "Sales recorded" },
  ];

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-map-border bg-map-surface/85 px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
        Monitor for
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {checkboxItems.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-1.5 text-[10px] text-map-text-secondary"
          >
            <Checkbox
              checked={criteria[key]}
              onCheckedChange={() => toggleCriteria(key)}
              className="h-3 w-3 border-map-border data-[state=checked]:bg-map-accent data-[state=checked]:text-white"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-map-text-muted">Acres</span>
          <Input
            type="number"
            placeholder="Min"
            value={criteria.minAcreage ?? ""}
            onChange={(e) => updateNumericField("minAcreage", e.target.value)}
            className="h-6 w-14 border-map-border bg-map-surface px-1.5 text-[10px] text-map-text-primary placeholder:text-map-text-muted"
          />
          <span className="text-[9px] text-map-text-muted">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={criteria.maxAcreage ?? ""}
            onChange={(e) => updateNumericField("maxAcreage", e.target.value)}
            className="h-6 w-14 border-map-border bg-map-surface px-1.5 text-[10px] text-map-text-primary placeholder:text-map-text-muted"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-map-text-muted">Zoning</span>
          <Input
            type="text"
            placeholder="e.g. M-1"
            value={criteria.zoningPrefix ?? ""}
            onChange={(e) => updateZoningPrefix(e.target.value)}
            className="h-6 w-16 border-map-border bg-map-surface px-1.5 text-[10px] text-map-text-primary placeholder:text-map-text-muted"
          />
        </div>
      </div>
    </div>
  );
}

export function SavedGeofences({ currentPolygon, onApply }: SavedGeofencesProps) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<SavedGeofence[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const activePolygonSignature = getPolygonSignature(currentPolygon);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/geofences");
      if (!res.ok) {
        setError(
          await getGeofenceErrorMessage(
            res,
            "Unable to load saved geofences.",
          ),
        );
        return;
      }
      const data = (await res.json()) as { geofences?: Array<{ id: string; name: string; coordinates: number[][][]; createdAt: string }> };
      const rawItems = Array.isArray(data.geofences) ? data.geofences : [];
      setItems(mergeAlertData(rawItems));
    } catch {
      setError("Unable to load saved geofences.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!currentPolygon || !name.trim()) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), coordinates: currentPolygon }),
      });
      if (!res.ok) {
        setError(
          await getGeofenceErrorMessage(
            res,
            "Unable to save this geofence.",
          ),
        );
        return;
      }

      setName("");
      await load();
    } catch {
      setError("Unable to save this geofence.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    setPendingDeleteId(id);
    setError(null);

    try {
      const res = await fetch(`/api/geofences/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(
          await getGeofenceErrorMessage(
            res,
            "Unable to delete this geofence.",
          ),
        );
        return;
      }
      removeAlertForGeofence(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Unable to delete this geofence.");
    } finally {
      setPendingDeleteId(null);
    }
  };

  const updateGeofenceAlert = useCallback((updated: SavedGeofence) => {
    persistAlertForGeofence(updated);
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const toggleAlert = useCallback((geofence: SavedGeofence) => {
    const updated: SavedGeofence = {
      ...geofence,
      alertEnabled: !geofence.alertEnabled,
    };
    persistAlertForGeofence(updated);
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (!geofence.alertEnabled) {
      setExpandedAlertId(geofence.id);
    }
  }, []);

  return (
    <div data-tour="geofences" className="flex flex-col gap-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
            Saved Geofences
          </p>
          <p className="mt-1 text-[11px] leading-5 text-map-text-secondary">
            Reusable parcel search areas for repeat prospecting and site review.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void load();
          }}
          className="h-7 text-[10px]"
        >
          Refresh
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px] text-map-text-muted">
        <span>
          {currentPolygon
            ? "Active polygon ready to save"
            : "Draw or apply an area to enable save"}
        </span>
        <span>{items.length} saved</span>
      </div>

      <div className="flex gap-1.5">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Geofence name"
          className="min-w-0 h-8 flex-1 border-map-border bg-map-surface text-[11px] text-map-text-primary placeholder:text-map-text-muted"
        />
        <Button
          type="button"
          disabled={!currentPolygon || !name.trim() || isSaving}
          onClick={save}
          className="h-8 bg-map-accent px-2.5 text-[10px] font-medium text-white hover:bg-map-accent/90 disabled:opacity-40"
        >
          {isSaving ? "Saving..." : "Save area"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-map-border bg-map-accent-surface px-3 py-2 text-[11px] leading-5 text-map-text-primary">
          {error}
        </div>
      ) : null}

      <ScrollArea className="h-40">
        <div className="flex flex-col gap-1.5 pr-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-map-border bg-map-surface/75 px-3 py-3"
            >
              <Skeleton className="h-3 w-28 bg-map-surface-elevated" />
              <Skeleton className="mt-2 h-2.5 w-20 bg-map-surface-elevated" />
            </div>
          ))
        ) : null}
        {!loading && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-map-border bg-map-surface/70 px-3 py-3 text-[11px] leading-5 text-map-text-muted">
            No saved geofences yet. Draw a polygon, name it, and save it for repeat parcel scans.
          </div>
        ) : null}
        {items.map((item) => {
          const isExpanded = expandedAlertId === item.id;

          return (
            <div
              key={item.id}
              className="rounded-xl border border-map-border bg-map-surface/82 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[11px] font-medium text-map-text-primary">
                      {item.name}
                    </p>
                    {item.alertEnabled ? (
                      <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Monitoring
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] text-map-text-muted">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-map-text-muted/50" />
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-map-text-muted">
                      {formatGeofenceTimestamp(item.createdAt)}
                    </span>
                    <span className="text-[9px] text-map-text-muted">
                      Last alert: {formatRelativeTime(item.alertLastTriggered)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {activePolygonSignature === getPolygonSignature(item.coordinates) ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                      Active
                    </Badge>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleAlert(item)}
                    className="rounded p-1 transition-colors hover:bg-map-surface-elevated"
                    title={item.alertEnabled ? "Disable alerts" : "Enable alerts"}
                  >
                    {item.alertEnabled ? (
                      <BellRing className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5 text-map-text-muted" />
                    )}
                  </button>
                </div>
              </div>

              {item.alertEnabled ? (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedAlertId(isExpanded ? null : item.id)}
                    className="flex items-center gap-1 text-[9px] text-map-text-muted transition-colors hover:text-map-text-secondary"
                  >
                    <Bell className="h-2.5 w-2.5" />
                    Alert criteria
                    {isExpanded ? (
                      <ChevronUp className="h-2.5 w-2.5" />
                    ) : (
                      <ChevronDown className="h-2.5 w-2.5" />
                    )}
                  </button>
                  {isExpanded ? (
                    <AlertCriteriaPanel
                      geofence={item}
                      onUpdate={updateGeofenceAlert}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onApply(item.coordinates)}
                  className="h-7 px-2.5 text-[10px]"
                  title={item.name}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void remove(item.id);
                  }}
                  disabled={pendingDeleteId === item.id}
                  className="h-7 px-2.5 text-[10px] text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                >
                  {pendingDeleteId === item.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          );
        })}
        </div>
      </ScrollArea>
    </div>
  );
}
