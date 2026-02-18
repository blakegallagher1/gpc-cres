 "use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProspectFilters, type ProspectFilterState } from "@/components/prospecting/ProspectFilters";
import { ProspectResults, type ProspectParcel } from "@/components/prospecting/ProspectResults";
import { SavedSearchBuilder } from "@/components/opportunities/SavedSearchBuilder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

interface SavedSearchItem {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
}

const ProspectMap = dynamic(
  () =>
    import("@/components/prospecting/ProspectMap").then((m) => m.ProspectMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

function ProspectingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [filters, setFilters] = useState<ProspectFilterState>({
    searchText: "",
    zoningCodes: [],
    minAcreage: undefined,
    maxAcreage: undefined,
    minAssessedValue: undefined,
    maxAssessedValue: undefined,
    excludeFloodZone: false,
  });
  const [parcels, setParcels] = useState<ProspectParcel[]>([]);
  const [allParcels, setAllParcels] = useState<ProspectParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<string>("__none");
  const selectedSavedSearchId = searchParams?.get("savedSearchId") ?? null;

  const shouldShowSavedPanel = searchParams?.get("tab") === "saved-filters";
  const { data: savedSearchResponse, mutate: mutateSavedSearches } = useSWR<{
    searches: SavedSearchItem[];
  }>("/api/saved-searches", fetcher);

  const savedSearches = savedSearchResponse?.searches ?? [];

  const toFilters = useCallback((criteria: Record<string, unknown>): ProspectFilterState => {
    const parseNumber = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    const parseBoolean = (value: unknown): boolean => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
      }
      return false;
    };

    const next: ProspectFilterState = {
      searchText: typeof criteria.searchText === "string" ? criteria.searchText : "",
      zoningCodes:
        Array.isArray(criteria.zoningCodes) &&
        criteria.zoningCodes.every((item) => typeof item === "string")
          ? criteria.zoningCodes
          : [],
      minAcreage: parseNumber(criteria.minAcreage),
      maxAcreage: parseNumber(criteria.maxAcreage),
      minAssessedValue: parseNumber(criteria.minAssessedValue),
      maxAssessedValue: parseNumber(criteria.maxAssessedValue),
      excludeFloodZone: parseBoolean(criteria.excludeFloodZone),
    };
    return next;
  }, []);

  const getSavedSearchPolygon = useCallback((criteria: Record<string, unknown>) => {
    const rawPolygon = criteria.polygon;
    if (
      rawPolygon &&
      typeof rawPolygon === "object" &&
      (rawPolygon as Record<string, unknown>).type === "Polygon"
    ) {
      const coordinates = (rawPolygon as { coordinates?: unknown }).coordinates;
      if (Array.isArray(coordinates) && coordinates[0]) {
        return coordinates as number[][][];
      }
    }
    return null;
  }, []);

  const setSavedSearchParam = useCallback(
    (searchId: string) => {
      const nextParams = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      if (searchId === "__none") {
        nextParams.delete("savedSearchId");
      } else {
        nextParams.set("savedSearchId", searchId);
      }
      const query = nextParams.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const searchParcels = useCallback(
    async (poly: number[][][], f: ProspectFilterState) => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch("/api/map/prospect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            polygon: { type: "Polygon", coordinates: poly },
            filters: {
              searchText: f.searchText.trim() || undefined,
              zoningCodes: f.zoningCodes.length > 0 ? f.zoningCodes : undefined,
              minAcreage: f.minAcreage,
              maxAcreage: f.maxAcreage,
              minAssessedValue: f.minAssessedValue,
              maxAssessedValue: f.maxAssessedValue,
              excludeFloodZone: f.excludeFloodZone,
            },
          }),
        });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setAllParcels(data.parcels || []);
        setParcels(data.parcels || []);
        setSelectedIds(new Set());
      } catch {
        setParcels([]);
        setAllParcels([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const applySavedSearch = useCallback(
    async (search: SavedSearchItem) => {
      const nextFilters = toFilters(search.criteria);
      const nextPolygon = getSavedSearchPolygon(search.criteria);

      setActiveSavedSearchId(search.id);
      setFilters(nextFilters);

      if (nextPolygon) {
        setPolygon(nextPolygon);
        await searchParcels(nextPolygon, nextFilters);
        return;
      }

      if (polygon) {
        await searchParcels(polygon, nextFilters);
      }

      if (!polygon && !nextPolygon) {
        setSearched(false);
        setParcels([]);
        setAllParcels([]);
      }

      toast.success(`Applied filters from “${search.name}”`);
    },
    [getSavedSearchPolygon, polygon, searchParcels, toFilters]
  );

  const handleSavedSearchSelection = useCallback(
    (searchId: string) => {
      if (searchId === "__none") {
        setActiveSavedSearchId("__none");
        setSavedSearchParam("__none");
        return;
      }

      const selected = savedSearches.find((search) => search.id === searchId);
      if (!selected) {
        return;
      }

      setSavedSearchParam(searchId);
      void applySavedSearch(selected);
    },
    [applySavedSearch, savedSearches, setSavedSearchParam]
  );

  const handleDeleteSearch = useCallback(
    async (searchId: string) => {
      try {
        const response = await fetch(`/api/saved-searches/${searchId}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to delete saved search");
        toast.success("Saved search deleted");
        await mutateSavedSearches();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete");
      }
    },
    [mutateSavedSearches]
  );

  const handleRunSearch = useCallback(async (searchId: string) => {
    try {
      const response = await fetch(`/api/saved-searches/${searchId}/run`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to run saved search");
      const result = await response.json().catch(() => null);
      toast.success(
        result && typeof result.newMatches === "number"
          ? `Run complete · ${result.newMatches} new match${result.newMatches === 1 ? "" : "es"}`
          : "Saved search executed"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run search");
    }
  }, []);

  const handlePolygonDrawn = useCallback(
    (coords: number[][][]) => {
      setPolygon(coords);
      searchParcels(coords, filters);
    },
    [filters, searchParcels]
  );

  const handleFiltersChange = useCallback(
    (newFilters: ProspectFilterState) => {
      if (activeSavedSearchId !== "__none") {
        setActiveSavedSearchId("__none");
        setSavedSearchParam("__none");
      }
      setFilters(newFilters);
      if (polygon) {
        searchParcels(polygon, newFilters);
      }
    },
    [activeSavedSearchId, polygon, searchParcels, setSavedSearchParam]
  );

  const handleClear = useCallback(() => {
    setPolygon(null);
    setParcels([]);
    setAllParcels([]);
    setSearched(false);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    if (!selectedSavedSearchId) {
      return;
    }

    const matchingSavedSearch = savedSearches.find(
      (search) => search.id === selectedSavedSearchId
    );
    if (!matchingSavedSearch) {
      setActiveSavedSearchId("__none");
      setSavedSearchParam("__none");
      return;
    }

    if (matchingSavedSearch.id === activeSavedSearchId) {
      return;
    }

    void applySavedSearch(matchingSavedSearch);
  }, [
    activeSavedSearchId,
    applySavedSearch,
    savedSearches,
    selectedSavedSearchId,
    setSavedSearchParam,
  ]);

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Prospecting
          </h1>
          <p className="text-sm text-muted-foreground">
            Draw an area on the map to find parcels. Filter, select, and create deals in bulk.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {shouldShowSavedPanel && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Saved Filters</CardTitle>
                  <SavedSearchBuilder onCreated={() => mutateSavedSearches()} />
                </div>
                <div className="mt-3">
                  <Select
                    value={activeSavedSearchId}
                    onValueChange={handleSavedSearchSelection}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a saved filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {savedSearches.map((search) => (
                        <SelectItem key={search.id} value={search.id}>
                          {search.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {savedSearches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No saved filters yet. Create one to quickly restore saved criteria.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedSearches.map((search) => (
                      <div
                        key={search.id}
                        className="rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{search.name}</p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => applySavedSearch(search)}>
                              Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRunSearch(search.id)}
                            >
                              Run
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteSearch(search.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {/* Map */}
          <div>
            <ProspectMap
              parcels={parcels}
              polygon={polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onClear={handleClear}
              selectedIds={selectedIds}
            />
            {loading && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching parcels in area...
              </div>
            )}
            {searched && !loading && (
              <p className="mt-2 text-sm text-muted-foreground">
                {parcels.length} parcel{parcels.length !== 1 ? "s" : ""} found
              </p>
            )}
          </div>

          {/* Filters panel */}
          <ProspectFilters
            filters={filters}
            onChange={handleFiltersChange}
            disabled={!polygon}
          />
        </div>

        {/* Results table */}
        {searched && (
          <ProspectResults
            parcels={parcels}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            polygon={polygon}
          />
        )}
      </div>
    </DashboardShell>
  );
}

function ProspectingPageLoading() {
  return (
    <DashboardShell>
      <div className="py-24 text-center text-sm text-muted-foreground">
        Loading prospecting...
      </div>
    </DashboardShell>
  );
}

export default function ProspectingPage() {
  return (
    <Suspense fallback={<ProspectingPageLoading />}>
      <ProspectingPageContent />
    </Suspense>
  );
}
