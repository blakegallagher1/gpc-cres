"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, FilePlus, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { fetchScreeningJson, getScreeningDealUrl } from "@/lib/screeningApi";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type ScreeningDeal = {
  project: {
    id: string;
    name: string;
    address?: string | null;
  };
  latest_run?: {
    id: string;
    status?: string | null;
    needs_review?: boolean | null;
    completed_at?: string | null;
    created_at?: string | null;
  } | null;
  score?: {
    overall_score?: number | null;
    financial_score?: number | null;
    qualitative_score?: number | null;
  } | null;
  final_scores?: {
    overall_score?: number | null;
    financial_score?: number | null;
    qualitative_score?: number | null;
  } | null;
};

const screeningSkeletonRows = Array.from({ length: 6 }, (_, index) => index);

export default function ScreeningIndexPage() {
  const [deals, setDeals] = useState<ScreeningDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filterValidationError, setFilterValidationError] = useState<string | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const scoreMin = useMemo(() => {
    const trimmed = minScore.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }, [minScore]);

  const scoreMax = useMemo(() => {
    const trimmed = maxScore.trim();
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }, [maxScore]);

  const fromDateMs = useMemo(() => {
    if (!createdFrom.trim()) return null;
    const value = new Date(`${createdFrom}T00:00:00`);
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }, [createdFrom]);

  const toDateMs = useMemo(() => {
    if (!createdTo.trim()) return null;
    const value = new Date(`${createdTo}T23:59:59.999`);
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }, [createdTo]);

  const filteredDeals = useMemo(() => {
    if (fromDateMs === null && toDateMs === null) return deals;

    return deals.filter((deal) => {
      const lastUpdated =
        deal.latest_run?.completed_at ?? deal.latest_run?.created_at ?? null;
      if (!lastUpdated) return false;

      const updatedMs = new Date(lastUpdated).getTime();
      if (!Number.isFinite(updatedMs)) return false;

      if (fromDateMs !== null && updatedMs < fromDateMs) return false;
      if (toDateMs !== null && updatedMs > toDateMs) return false;

      return true;
    });
  }, [deals, fromDateMs, toDateMs]);

  const clearFilters = () => {
    setStatusFilter("all");
    setReviewFilter("all");
    setSearch("");
    setMinScore("");
    setMaxScore("");
    setCreatedFrom("");
    setCreatedTo("");
    setFilterValidationError(null);
  };

  const validateFilters = () => {
    if (scoreMin === null) {
      return "Min score must be a valid number.";
    }

    if (scoreMax === null) {
      return "Max score must be a valid number.";
    }

    if (
      typeof scoreMin === "number" &&
      typeof scoreMax === "number" &&
      scoreMin > scoreMax
    ) {
      return "Min score cannot be greater than max score.";
    }

    if (fromDateMs !== null && toDateMs !== null && fromDateMs > toDateMs) {
      return "Created-from date cannot be later than created-to date.";
    }

    return null;
  };

  const loadDeals = async () => {
    const validationError = validateFilters();
    if (validationError) {
      setFilterValidationError(validationError);
      toast.error(validationError);
      return;
    }

    setErrorMessage(null);
    setFilterValidationError(null);
    setLoading(true);
    setDeals([]);

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (reviewFilter !== "all")
      params.set("needs_review", reviewFilter === "review" ? "true" : "false");
    if (search.trim()) params.set("search", search.trim());
    if (typeof scoreMin === "number") params.set("min_score", String(scoreMin));
    if (typeof scoreMax === "number") params.set("max_score", String(scoreMax));
    const endpoint = `/screening/deals${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    try {
      const payload = await fetchScreeningJson<{ deals?: ScreeningDeal[] }>(
        endpoint,
        {},
        { retries: 3, retryDelayMs: 500 }
      );
      setDeals(payload.deals ?? []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load screening deals";
      setErrorMessage(message);
      console.error("Failed to load screening deals:", error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, []);

  return (
    <DashboardShell>
      <TooltipProvider>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Deal Screening</h1>
              <p className="text-sm text-muted-foreground">
                Intake, score, and prioritize new industrial deals across
                Louisiana.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/screening/playbook">Playbook</Link>
              </Button>
              <Button asChild className="gap-2">
                <Link href="/screening/intake">
                  <FilePlus className="h-4 w-4" />
                  New Screening
                </Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Filters</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Narrow the list by status, score, or review requirement.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={clearFilters}
                >
                  Clear Filters
                </Button>
                <Button className="gap-2" onClick={loadDeals}>
                  Apply
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Review
                </label>
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All deals</SelectItem>
                    <SelectItem value="review">Needs review</SelectItem>
                    <SelectItem value="clear">Reviewed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Min Score
                </label>
                <Input
                  value={minScore}
                  onChange={(event) => setMinScore(event.target.value)}
                  placeholder="1.0"
                  type="number"
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Max Score
                </label>
                <Input
                  value={maxScore}
                  onChange={(event) => setMaxScore(event.target.value)}
                  placeholder="5.0"
                  type="number"
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Address, broker, doc text"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Created After
                </label>
                <Input
                  value={createdFrom}
                  onChange={(event) => setCreatedFrom(event.target.value)}
                  type="date"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Created Before
                </label>
                <Input
                  value={createdTo}
                  onChange={(event) => setCreatedTo(event.target.value)}
                  type="date"
                />
              </div>
            </CardContent>
            {(filterValidationError || errorMessage) && (
              <div className="border-t border-border px-6 pb-4 pt-3 text-xs text-destructive">
                {filterValidationError || errorMessage}
              </div>
            )}
          </Card>

          {loading ? (
            <Card>
              <CardContent className="space-y-4 py-8">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {screeningSkeletonRows.map((item) => (
                    <Card key={item} className="border-dashed">
                      <CardContent className="space-y-3 pt-6">
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-9 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : errorMessage ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <p className="mb-3">{errorMessage}</p>
                <Button variant="outline" size="sm" onClick={loadDeals}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : filteredDeals.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {deals.length === 0
                  ? "No screening deals found. Start with a new intake."
                  : "No screening deals match the active filters."}
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                  {deals.length === 0 ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/screening/intake">Create screening intake</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDeals.map((deal) => {
                const score = deal.final_scores?.overall_score;
                const status = deal.latest_run?.status || "queued";
                const detailUrl = getScreeningDealUrl(deal.project.id);
                const lastUpdated = deal.latest_run?.completed_at
                  ? formatDate(deal.latest_run.completed_at)
                  : deal.latest_run?.created_at
                    ? formatDate(deal.latest_run.created_at)
                    : "pending";
                const scoreValue =
                  score !== null && score !== undefined ? score.toFixed(2) : "--";
                const financialValue =
                  deal.final_scores?.financial_score?.toFixed(2) ?? "--";
                const qualitativeValue =
                  deal.final_scores?.qualitative_score?.toFixed(2) ?? "--";

                return (
                  <Tooltip key={deal.project.id}>
                    <TooltipTrigger asChild>
                      <Card className="transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-lg">
                              <Link
                                href={detailUrl}
                                className="hover:underline underline-offset-2"
                              >
                                {deal.project.name}
                              </Link>
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {deal.project.address || "No address provided"}
                            </p>
                          </div>
                          <Badge
                            variant={status === "complete" ? "secondary" : "outline"}
                          >
                            {status}
                          </Badge>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Overall Score
                              </p>
                              <p className="text-lg font-semibold">
                                {scoreValue}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Needs Review
                              </p>
                              <p className="text-sm font-medium">
                                {deal.latest_run?.needs_review ? "Yes" : "No"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Financial
                              </p>
                              <p className="text-sm font-medium">{financialValue}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Qualitative
                              </p>
                              <p className="text-sm font-medium">
                                {qualitativeValue}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Last update: {lastUpdated}</span>
                            {deal.latest_run?.needs_review && (
                              <Badge variant="destructive">Needs review</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button asChild className="flex-1">
                              <Link href={detailUrl}>Open Deal</Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              asChild
                              aria-label={`Preview ${deal.project.name}`}
                            >
                              <Link href={detailUrl}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-xs">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium">Screening Snapshot</p>
                        <p className="text-xs text-muted-foreground">
                          Status:{" "}
                          <span className="font-medium text-foreground">
                            {status}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last update:{" "}
                          <span className="font-medium text-foreground">
                            {lastUpdated}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Overall score:{" "}
                          <span className="font-medium text-foreground">
                            {scoreValue}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Financial:{" "}
                          <span className="font-medium text-foreground">
                            {financialValue}
                          </span>{" "}
                          · Qualitative:{" "}
                          <span className="font-medium text-foreground">
                            {qualitativeValue}
                          </span>
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      </TooltipProvider>
    </DashboardShell>
  );
}
