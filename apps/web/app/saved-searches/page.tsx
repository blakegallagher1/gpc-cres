"use client";

import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedSearchBuilder } from "@/components/opportunities/SavedSearchBuilder";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const searches = data?.searches ?? [];

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
      toast.error(
        err instanceof Error ? err.message : "Failed to run search"
      );
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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete search"
      );
    } finally {
      setDeletingId(null);
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
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium">
                  No saved searches yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Create a saved search to automatically scan 560K parcels
                  for opportunities.
                </p>
              </div>
              <SavedSearchBuilder
                onCreated={() => mutate()}
                trigger={
                  <Button size="sm" className="mt-2 gap-1.5">
                    <Search className="h-4 w-4" />
                    Create First Search
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">
                          {s.name}
                        </h3>
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
