"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  MapPin,
  Sparkles,
  Loader2,
  Eye,
  X,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedSearchBuilder } from "./SavedSearchBuilder";
import { cn } from "@/lib/utils";

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
  matchScore: string; // Decimal comes as string
  parcelData: ParcelData;
  parcelId: string;
  seenAt: string | null;
  savedSearch: { id: string; name: string };
  createdAt: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600 bg-green-50";
  if (score >= 60) return "text-yellow-600 bg-yellow-50";
  return "text-muted-foreground bg-muted";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OpportunityFeed() {
  const router = useRouter();
  const {
    data,
    isLoading,
    mutate,
  } = useSWR<{ opportunities: OpportunityItem[]; total: number }>(
    "/api/opportunities?limit=8",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const opportunities = data?.opportunities ?? [];
  const total = data?.total ?? 0;

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    mutate();
  };

  const handleCreateDeal = (e: React.MouseEvent, opp: OpportunityItem) => {
    e.stopPropagation();
    // Mark as seen
    fetch(`/api/opportunities/${opp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => {});

    // Navigate to deal creation with pre-populated parcel data
    const params = new URLSearchParams();
    if (opp.parcelData.address) params.set("address", opp.parcelData.address);
    if (opp.parcelData.parish) params.set("parish", opp.parcelData.parish);
    if (opp.parcelData.acreage)
      params.set("acreage", String(opp.parcelData.acreage));
    if (opp.parcelId) params.set("propertyDbId", opp.parcelId);

    router.push(`/deals/new?${params.toString()}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Sparkles className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-base">Opportunities</CardTitle>
            {total > 0 && (
              <Badge variant="secondary" className="ml-1">
                {total}
              </Badge>
            )}
          </div>
          <SavedSearchBuilder onCreated={() => mutate()} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : opportunities.length > 0 ? (
          <div className="space-y-2">
            {opportunities.map((opp) => {
              const score = parseFloat(opp.matchScore);
              const isUnseen = !opp.seenAt;

              return (
                <div
                  key={opp.id}
                  className={cn(
                    "group relative rounded-lg border p-3 transition-colors hover:bg-muted/50",
                    isUnseen && "border-primary/20 bg-primary/[0.02]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Score badge */}
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                        scoreColor(score)
                      )}
                    >
                      {Math.round(score)}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {opp.parcelData.address || "No address"}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {opp.parcelData.parish}
                            </span>
                            {opp.parcelData.acreage && (
                              <>
                                <span>·</span>
                                <span>
                                  {Number(opp.parcelData.acreage).toFixed(1)} ac
                                </span>
                              </>
                            )}
                            <span>·</span>
                            <span>{opp.parcelData.ownerName}</span>
                          </div>
                        </div>

                        {/* Dismiss button */}
                        <button
                          onClick={(e) => handleDismiss(e, opp.id)}
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          title="Dismiss"
                        >
                          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>

                      {/* Meta + actions */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px]"
                          >
                            {opp.savedSearch.name}
                          </Badge>
                          <span>{timeAgo(opp.createdAt)}</span>
                          {isUnseen && (
                            <span className="flex items-center gap-0.5 text-primary">
                              <Eye className="h-3 w-3" />
                              New
                            </span>
                          )}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={(e) => handleCreateDeal(e, opp)}
                        >
                          <Plus className="h-3 w-3" />
                          Create Deal
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {total > opportunities.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => router.push("/saved-searches")}
              >
                View all {total} opportunities
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No opportunities yet.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Create a saved search to start surfacing matches from 560K
              parcels.
            </p>
            <SavedSearchBuilder
              onCreated={() => mutate()}
              trigger={
                <Button variant="outline" size="sm" className="mt-1 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Create Saved Search
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
