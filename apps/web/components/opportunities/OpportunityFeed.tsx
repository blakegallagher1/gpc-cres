"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowRight,
  Check,
  Eye,
  Loader2,
  Map,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { SavedSearchBuilder } from "./SavedSearchBuilder";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ParcelData {
  parish: string;
  parcelUid: string;
  ownerName: string;
  address: string;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
}

interface OpportunityItem {
  id: string;
  matchScore: string;
  priorityScore: number;
  parcelData: ParcelData;
  parcelId: string;
  seenAt: string | null;
  pursuedAt?: string | null;
  feedbackSignal: "new" | "seen" | "pursued" | "dismissed";
  thesis: {
    summary: string;
    whyNow: string;
    angle: string;
    nextBestAction: string;
    confidence: number;
    keyRisks: string[];
    signals: string[];
  };
  savedSearch: { id: string; name: string };
  createdAt: string;
}

interface OpportunityFeedProps {
  limit?: number;
  savedSearchId?: string | null;
  showViewAllLink?: boolean;
  showSearchBuilder?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return "border-primary/25 bg-primary/10 text-foreground";
  if (score >= 60) return "border-border/70 bg-muted/30 text-foreground";
  return "border-border/60 bg-background/34 text-muted-foreground";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OpportunityFeed({
  limit = 8,
  savedSearchId = null,
  showViewAllLink = true,
  showSearchBuilder = true,
}: OpportunityFeedProps) {
  const router = useRouter();
  const inboxHref = savedSearchId
    ? `/opportunities?savedSearchId=${encodeURIComponent(savedSearchId)}`
    : "/opportunities";
  const opportunitiesQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (savedSearchId) {
      params.set("savedSearchId", savedSearchId);
    }
    return `/api/opportunities?${params.toString()}`;
  }, [limit, savedSearchId]);

  const { data, isLoading, mutate } = useSWR<{ opportunities: OpportunityItem[]; total: number }>(
    opportunitiesQuery,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const opportunities = data?.opportunities ?? [];
  const total = data?.total ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"seen" | "dismiss" | null>(null);

  useEffect(() => {
    setSelectedIds((previous) => {
      const activeIds = new Set(opportunities.map((opp) => opp.id));
      const next = new Set([...previous].filter((id) => activeIds.has(id)));
      if (next.size === previous.size) return previous;
      return next;
    });
  }, [opportunities]);

  const handleDismiss = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    mutate();
  };

  const handleCreateDeal = (event: React.MouseEvent, opp: OpportunityItem) => {
    event.stopPropagation();

    fetch(`/api/opportunities/${opp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pursue" }),
    }).catch(() => {});

    const params = new URLSearchParams();
    if (opp.parcelData.address) params.set("address", opp.parcelData.address);
    if (opp.parcelData.parish) params.set("parish", opp.parcelData.parish);
    if (opp.parcelData.acreage) params.set("acreage", String(opp.parcelData.acreage));
    if (opp.parcelId) params.set("propertyDbId", opp.parcelId);

    router.push(`/deals/new?${params.toString()}`);
  };

  const handleOpenOnMap = (event: React.MouseEvent, opp: OpportunityItem) => {
    event.stopPropagation();

    const params = new URLSearchParams({ mode: "prospecting" });
    if (opp.parcelId) {
      params.set("parcel", opp.parcelId);
    } else if (opp.parcelData.lat != null && opp.parcelData.lng != null) {
      params.set("lat", String(opp.parcelData.lat));
      params.set("lng", String(opp.parcelData.lng));
      params.set("z", "16");
    }

    router.push(`/map?${params.toString()}`);
  };

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === opportunities.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(opportunities.map((opp) => opp.id)));
  };

  const handleBulkAction = async (action: "seen" | "dismiss") => {
    if (selectedIds.size === 0) return;
    setBulkAction(action);

    const ids = [...selectedIds];

    try {
      const res = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload && "error" in payload
            ? String(payload.error)
            : `Failed to ${action} selected opportunities`,
        );
      }

      const updated = payload?.result?.updated ?? ids.length;
      const label = action === "seen" ? "marked as seen" : "dismissed";
      toast.success(`${updated} opportunity${updated === 1 ? "" : "s"} ${label}`);

      setSelectedIds(new Set());
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Failed to ${action} selected opportunities`,
      );
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <section className="workspace-section space-y-4">
      <div className="workspace-section-header">
        <div className="space-y-2">
          <p className="workspace-section-kicker">Prospecting</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/42">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <h2 className="workspace-section-heading">Opportunities</h2>
            {total > 0 ? <Badge variant="secondary">{total}</Badge> : null}
          </div>
          <p className="workspace-section-copy">
            Saved-search matches ranked for operator review, deal creation, or dismissal.
          </p>
        </div>

        {opportunities.length > 0 ? (
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={
                opportunities.length > 0 && selectedIds.size === opportunities.length
                  ? true
                  : selectedIds.size > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={toggleSelectAll}
              aria-label="Select all opportunities"
            />
            Select visible
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0 || bulkAction === "seen"}
            onClick={() => handleBulkAction("seen")}
          >
            {bulkAction === "seen" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Mark seen
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0 || bulkAction === "dismiss"}
            onClick={() => handleBulkAction("dismiss")}
          >
            {bulkAction === "dismiss" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Dismiss
          </Button>
        </div>

        {showSearchBuilder ? <SavedSearchBuilder onCreated={() => mutate()} /> : null}
      </div>

      {selectedIds.size > 0 ? (
        <p className="workspace-inline-meta">{selectedIds.size} selected</p>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : opportunities.length > 0 ? (
        <div className="workspace-list">
          {opportunities.map((opp) => {
            const score = opp.priorityScore;
            const isUnseen = !opp.seenAt;
            const isPursued = opp.feedbackSignal === "pursued";

            return (
              <div
                key={opp.id}
                className={cn("workspace-list-row group", isUnseen && "bg-primary/[0.03]")}
              >
                <div className="mt-1">
                  <Checkbox
                    checked={selectedIds.has(opp.id)}
                    onCheckedChange={(checked) =>
                      toggleSelection(opp.id, checked === true || checked === "indeterminate")
                    }
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select opportunity ${opp.parcelData.address || opp.id}`}
                  />
                </div>

                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold",
                    scoreColor(score),
                  )}
                >
                  {Math.round(score)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {opp.parcelData.address || "No address"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {opp.parcelData.parish}
                        </span>
                        {opp.parcelData.acreage ? (
                          <>
                            <span>·</span>
                            <span>{Number(opp.parcelData.acreage).toFixed(1)} ac</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{opp.parcelData.ownerName}</span>
                      </div>
                    </div>

                    <button
                      onClick={(event) => handleDismiss(event, opp.id)}
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="outline">{opp.savedSearch.name}</Badge>
                      <Badge variant="secondary">
                        {Math.round(opp.thesis.confidence * 100)}% confidence
                      </Badge>
                      <span>{timeAgo(opp.createdAt)}</span>
                      {isUnseen ? (
                        <span className="flex items-center gap-0.5 text-primary">
                          <Eye className="h-3 w-3" />
                          New
                        </span>
                      ) : null}
                      {isPursued ? (
                        <span className="flex items-center gap-0.5 text-foreground">
                          <Check className="h-3 w-3" />
                          Pursued
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={(event) => handleOpenOnMap(event, opp)}
                      >
                        <Map className="h-3 w-3" />
                        Open on map
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={(event) => handleCreateDeal(event, opp)}
                      >
                        <Plus className="h-3 w-3" />
                        Create Deal
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 border-t border-border/40 pt-4 text-xs sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">{opp.thesis.summary}</p>
                      <p className="text-muted-foreground">{opp.thesis.whyNow}</p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="workspace-section-kicker">Angle</p>
                        <p className="mt-1 text-muted-foreground">{opp.thesis.angle}</p>
                      </div>
                      <div>
                        <p className="workspace-section-kicker">Next action</p>
                        <p className="mt-1 text-muted-foreground">{opp.thesis.nextBestAction}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {opp.thesis.signals.slice(0, 3).map((signalText) => (
                      <Badge key={signalText} variant="outline">
                        {signalText}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-3">
                    <p className="workspace-section-kicker">Key risks</p>
                    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {opp.thesis.keyRisks.slice(0, 2).map((risk) => (
                        <li key={risk}>• {risk}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}

          {showViewAllLink && total > opportunities.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => router.push(inboxHref)}
            >
              View all {total} opportunities
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 border-t border-border/50 py-6 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {savedSearchId ? "No matches for this saved search yet." : "No opportunities yet."}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {savedSearchId
              ? "Run the saved search from prospecting to generate fresh parcel matches."
              : "Create a saved search to start surfacing matches from 560K parcels."}
          </p>
          {showSearchBuilder ? (
            <SavedSearchBuilder
              onCreated={() => mutate()}
              trigger={
                <Button variant="outline" size="sm" className="mt-1 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Create Saved Search
                </Button>
              }
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
