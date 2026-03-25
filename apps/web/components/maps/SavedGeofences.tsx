"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type SavedGeofence = {
  id: string;
  name: string;
  coordinates: number[][][];
  createdAt: string;
};

interface SavedGeofencesProps {
  currentPolygon: number[][][] | null;
  onApply: (coordinates: number[][][]) => void;
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

export function SavedGeofences({ currentPolygon, onApply }: SavedGeofencesProps) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<SavedGeofence[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const data = (await res.json()) as { geofences?: SavedGeofence[] };
      setItems(Array.isArray(data.geofences) ? data.geofences : []);
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
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Unable to delete this geofence.");
    } finally {
      setPendingDeleteId(null);
    }
  };

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
              className="rounded-xl border border-map-border bg-map-surface/40 px-3 py-3"
            >
              <Skeleton className="h-3 w-28 bg-map-surface-elevated" />
              <Skeleton className="mt-2 h-2.5 w-20 bg-map-surface-elevated" />
            </div>
          ))
        ) : null}
        {!loading && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-map-border bg-map-surface/30 px-3 py-3 text-[11px] leading-5 text-map-text-muted">
            No saved geofences yet. Draw a polygon, name it, and save it for repeat parcel scans.
          </div>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-map-text-primary">
                  {item.name}
                </p>
                <p className="mt-1 text-[10px] text-map-text-muted">
                  {formatGeofenceTimestamp(item.createdAt)}
                </p>
              </div>
              {activePolygonSignature === getPolygonSignature(item.coordinates) ? (
                <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                  Active
                </Badge>
              ) : null}
            </div>

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
        ))}
        </div>
      </ScrollArea>
    </div>
  );
}
