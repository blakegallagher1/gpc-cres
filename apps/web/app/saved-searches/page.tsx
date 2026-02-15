"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Search,
  Trash2,
  Play,
  Loader2,
  Bell,
  BellOff,
  Clock,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { SavedSearchBuilder } from "@/components/opportunities/SavedSearchBuilder";
import { toast } from "sonner";
import { GuidedOnboardingPanel } from "@/components/onboarding/GuidedOnboardingPanel";

const SAVED_SEARCH_PRESETS = [
  {
    name: "High Acre Industrial Candidates",
    criteria: {
      parishes: ["East Baton Rouge", "Ascension"],
      zoningCodes: ["M1", "M2", "M3"],
      minAcreage: 2,
      maxAcreage: 35,
      searchText: "industrial",
    },
    alertEnabled: true,
    alertFrequency: "DAILY",
  },
  {
    name: "Truck Parking and Storage Focus",
    criteria: {
      parishes: ["East Baton Rouge"],
      zoningCodes: ["M3", "A1", "A2"],
      minAcreage: 1,
      maxAcreage: 12,
      searchText: "truck parking",
    },
    alertEnabled: true,
    alertFrequency: "WEEKLY",
  },
  {
    name: "Small Bay Flex Watchlist",
    criteria: {
      zoningCodes: ["C1", "C2", "C3"],
      minAcreage: 0.5,
      maxAcreage: 8,
      searchText: "small bay",
    },
    alertEnabled: false,
    alertFrequency: "MONTHLY",
  },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SavedSearchItem {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  alertEnabled: boolean;
  alertFrequency: string;
  lastRunAt: string | null;
  matchCount: number;
  createdAt: string;
  _count: { matches: number };
}

function formatCriteria(criteria: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(criteria.parishes) && criteria.parishes.length > 0) {
    parts.push(`Parishes: ${(criteria.parishes as string[]).join(", ")}`);
  }
  if (Array.isArray(criteria.zoningCodes) && criteria.zoningCodes.length > 0) {
    parts.push(`Zoning: ${(criteria.zoningCodes as string[]).join(", ")}`);
  }
  if (criteria.minAcreage || criteria.maxAcreage) {
    const min = criteria.minAcreage ?? "0";
    const max = criteria.maxAcreage ?? "+";
    parts.push(`Acreage: ${min}–${max}`);
  }
  if (criteria.searchText) {
    parts.push(`Keyword: "${criteria.searchText}"`);
  }
  return parts.length > 0 ? parts.join(" | ") : "All parcels";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SavedSearchesPage() {
  const { data, isLoading, mutate } = useSWR<{
    searches: SavedSearchItem[];
  }>("/api/saved-searches", fetcher);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingPresetId, setCreatingPresetId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<"run" | "delete" | null>(null);

  const searches = data?.searches ?? [];

  useEffect(() => {
    setSelectedIds((previous) => {
      const next = new Set(
        [...previous].filter((id) => searches.some((search) => search.id === id))
      );
      if (next.size === previous.size) return previous;
      return next;
    });
  }, [searches]);

  const toggleSelectAll = () => {
    if (selectedIds.size === searches.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(searches.map((search) => search.id)));
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch(`/api/saved-searches/${id}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to run search");
      const result = await res.json();
      toast.success(
        result.newMatches > 0
          ? `Found ${result.newMatches} new match${result.newMatches > 1 ? "es" : ""}!`
          : "No new matches found"
      );
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run search");
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-searches/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete search");
      toast.success("Search deleted");
      mutate();
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete search");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkRun = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading("run");
    const ids = [...selectedIds];

    try {
      const res = await fetch("/api/saved-searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", ids }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload && "error" in payload
            ? String(payload.error)
            : "Failed to run selected searches"
        );
      }
      const executed = payload?.result?.executed ?? ids.length;
      const errors = payload?.result?.errors?.length ?? 0;
      toast.success(`Executed ${executed} search${executed === 1 ? "" : "es"}`);
      if (errors > 0) {
        toast.warning(`${errors} search${errors === 1 ? "" : "es"} had errors`);
      }
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run selected searches");
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading("delete");
    const ids = [...selectedIds];

    try {
      const res = await fetch("/api/saved-searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload && "error" in payload
            ? String(payload.error)
            : "Failed to delete selected searches"
        );
      }
      const deleted = payload?.result?.deleted ?? ids.length;
      toast.success(`${deleted} search${deleted === 1 ? "" : "es"} deleted`);
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected searches");
    } finally {
      setBulkLoading(null);
    }
  };

  const handleSeedPresetSearch = async (preset: (typeof SAVED_SEARCH_PRESETS)[number]) => {
    setCreatingPresetId(preset.name);
    try {
      const response = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          criteria: preset.criteria,
          alertEnabled: preset.alertEnabled,
          alertFrequency: preset.alertFrequency,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create sample search");
      }

      toast.success(`Created sample search "${preset.name}"`);
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create sample search"
      );
    } finally {
      setCreatingPresetId(null);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Saved Searches
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor the property database for new opportunities
            </p>
          </div>
          <SavedSearchBuilder onCreated={() => mutate()} />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : searches.length === 0 ? (
          <GuidedOnboardingPanel
            icon={<Search className="h-4 w-4" />}
            title="No saved searches yet"
            description="Create your first watchlist and automate scanning parcels for new match signals."
            steps={[
              {
                title: "Define target parcel criteria",
                description:
                  "Choose parish, acreage, zoning, and search keywords that reflect your strategy.",
              },
              {
                title: "Save with alert cadence",
                description:
                  "Turn alerts on to stay ahead of newly imported listing events.",
              },
              {
                title: "Run and review matches",
                description:
                  "Each run updates the search stream and helps spot opportunities quickly.",
              },
            ]}
            sampleActions={SAVED_SEARCH_PRESETS.map((preset) => ({
              name: preset.name,
              description: preset.alertEnabled
                ? `Alerts: ${preset.alertFrequency}`
                : "Alerts disabled by default",
              actionLabel:
                creatingPresetId === preset.name ? "Creating..." : "Load sample",
              action: {
                label:
                  creatingPresetId === preset.name ? "Creating..." : "Load sample",
                icon: <Search className="h-3.5 w-3.5" />,
                disabled: creatingPresetId === preset.name,
                onClick: () => handleSeedPresetSearch(preset),
              },
            }))}
            customContent={
              <SavedSearchBuilder
                onCreated={() => mutate()}
                trigger={
                  <Button
                    size="sm"
                    className="gap-1.5"
                  >
                    <Search className="h-4 w-4" />
                    Create First Search
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      searches.length > 0 && selectedIds.size === searches.length
                        ? true
                        : selectedIds.size > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all saved searches"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size === 0
                      ? "Select searches"
                      : `${selectedIds.size} selected`}
                  </span>
                </label>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkRun}
                    disabled={selectedIds.size === 0 || bulkLoading === "run"}
                  >
                    {bulkLoading === "run" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Run selected
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0 || bulkLoading === "delete"}
                  >
                    {bulkLoading === "delete" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Delete selected
                  </Button>
                </div>
              </div>
            </div>

            {searches.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(s.id)}
                      onCheckedChange={(checked) =>
                        toggleSelect(s.id, checked === true || checked === "indeterminate")
                      }
                      aria-label={`Select ${s.name}`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{s.name}</h3>
                        {s.alertEnabled ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 text-[10px]"
                          >
                            <Bell className="h-3 w-3" />
                            {s.alertFrequency}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-[10px] text-muted-foreground"
                          >
                            <BellOff className="h-3 w-3" />
                            Alerts off
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {formatCriteria(s.criteria)}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{s._count.matches} match{s._count.matches !== 1 ? "es" : ""}</span>
                        {s.lastRunAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last run {timeAgo(s.lastRunAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleRun(s.id)}
                        disabled={runningId === s.id}
                      >
                        {runningId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Run
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                      >
                        {deletingId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
