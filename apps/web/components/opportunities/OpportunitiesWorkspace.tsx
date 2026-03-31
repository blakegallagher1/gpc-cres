"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, BellRing, Map, Radar, Rows3 } from "lucide-react";
import { OpportunityFeed } from "@/components/opportunities/OpportunityFeed";
import { SavedSearchBuilder } from "@/components/opportunities/SavedSearchBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.json() as Promise<T>;
};

type SavedSearchCriteria = {
  parishes?: string[];
  zoningCodes?: string[];
  minAcreage?: number;
  maxAcreage?: number;
  searchText?: string;
};

type SavedSearchRecord = {
  id: string;
  name: string;
  criteria: SavedSearchCriteria;
  alertEnabled: boolean;
  alertFrequency: "REALTIME" | "DAILY" | "WEEKLY";
  createdAt: string;
  _count: {
    matches: number;
  };
};

type SavedSearchResponse = {
  searches: SavedSearchRecord[];
};

type OpportunitiesWorkspaceProps = {
  initialSavedSearchId?: string | null;
};

function summarizeCriteria(criteria: SavedSearchCriteria): string[] {
  const parts: string[] = [];

  if (criteria.parishes?.length) {
    parts.push(criteria.parishes.join(", "));
  }

  if (criteria.zoningCodes?.length) {
    parts.push(`Zoning ${criteria.zoningCodes.slice(0, 3).join(", ")}`);
  }

  if (criteria.minAcreage != null || criteria.maxAcreage != null) {
    const min = criteria.minAcreage != null ? `${criteria.minAcreage}` : "0";
    const max = criteria.maxAcreage != null ? `${criteria.maxAcreage}` : "+";
    parts.push(`${min}-${max} ac`);
  }

  if (criteria.searchText?.trim()) {
    parts.push(`Keyword: ${criteria.searchText.trim()}`);
  }

  return parts.slice(0, 3);
}

function buildOpportunitiesHref(savedSearchId: string | null): string {
  return savedSearchId ? `/opportunities?savedSearchId=${encodeURIComponent(savedSearchId)}` : "/opportunities";
}

export function OpportunitiesWorkspace({
  initialSavedSearchId = null,
}: OpportunitiesWorkspaceProps) {
  const { data, isLoading } = useSWR<SavedSearchResponse>(
    "/api/saved-searches",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const searches = data?.searches ?? [];
  const activeSearch =
    searches.find((search) => search.id === initialSavedSearchId) ?? null;
  const alertEnabledCount = searches.filter((search) => search.alertEnabled).length;
  const totalMatches = searches.reduce((sum, search) => sum + search._count.matches, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-background/80 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Radar className="h-3.5 w-3.5" />
                Prospecting Inbox
              </Badge>
              {activeSearch ? (
                <Badge variant="secondary">{activeSearch.name}</Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Review parcel matches and convert the best ones fast.</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                This workspace now keeps saved-search selection, opportunity review, map handoff, and deal creation in one operating lane.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SavedSearchBuilder />
            <Button asChild variant="outline">
              <Link href="/map?mode=prospecting">
                Open map prospecting
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved searches</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? "..." : searches.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active watch definitions feeding the inbox.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Alerts live</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? "..." : alertEnabledCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Searches currently configured to notify operators.</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Match history</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? "..." : totalMatches}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total parcel matches captured across all saved searches.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <aside className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Filters</p>
              <h2 className="mt-1 text-base font-semibold">Saved searches</h2>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/opportunities">All</Link>
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))
            ) : searches.length > 0 ? (
              searches.map((search) => {
                const isActive = search.id === initialSavedSearchId;
                const criteriaSummary = summarizeCriteria(search.criteria);

                return (
                  <Link
                    key={search.id}
                    href={buildOpportunitiesHref(search.id)}
                    className={cn(
                      "block rounded-xl border px-3 py-3 transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/8"
                        : "border-border/60 bg-background hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{search.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {search._count.matches} matches captured
                        </p>
                      </div>
                      {search.alertEnabled ? (
                        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : null}
                    </div>

                    {criteriaSummary.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {criteriaSummary.map((item) => (
                          <Badge key={item} variant="outline" className="max-w-full truncate">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
                No saved searches yet. Create one to start feeding the inbox.
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 rounded-2xl border border-border/60 bg-background/80 p-4">
          <OpportunityFeed
            limit={50}
            savedSearchId={initialSavedSearchId}
            showViewAllLink={false}
            showSearchBuilder={false}
          />
        </div>

        <aside className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active context</p>
          <h2 className="mt-1 text-base font-semibold">
            {activeSearch ? activeSearch.name : "All opportunities"}
          </h2>

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Current view</p>
              <p className="mt-2 text-sm text-foreground">
                {activeSearch
                  ? "Focused on one saved search so operators can clear a single lane without cross-noise."
                  : "Aggregating every saved-search lane into one review queue for broad triage."}
              </p>
            </div>

            {activeSearch ? (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Search settings</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={activeSearch.alertEnabled ? "default" : "secondary"}>
                    {activeSearch.alertEnabled
                      ? `${activeSearch.alertFrequency} alerts`
                      : "Alerts off"}
                  </Badge>
                  <Badge variant="outline">{activeSearch._count.matches} total matches</Badge>
                </div>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  {summarizeCriteria(activeSearch.criteria).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Operator loop</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>1. Filter the queue with a saved search.</p>
                <p>2. Open the strongest parcel in map for spatial review.</p>
                <p>3. Convert directly into a deal when the thesis clears.</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Button asChild variant="outline" className="justify-between">
                <Link href="/map?mode=prospecting">
                  Send to map prospecting
                  <Map className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href={buildOpportunitiesHref(null)}>
                  Review full queue
                  <Rows3 className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
