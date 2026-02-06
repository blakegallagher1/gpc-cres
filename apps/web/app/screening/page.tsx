"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, FilePlus, SlidersHorizontal } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
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

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function ScreeningIndexPage() {
  const [deals, setDeals] = useState<ScreeningDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  const loadDeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (reviewFilter !== "all")
        params.set("needs_review", reviewFilter === "review" ? "true" : "false");
      if (search.trim()) params.set("search", search.trim());
      if (minScore.trim()) params.set("min_score", minScore.trim());
      if (maxScore.trim()) params.set("max_score", maxScore.trim());

      const response = await fetch(
        `${backendUrl}/screening/deals?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to load screening deals");
      }
      const payload = (await response.json()) as { deals?: ScreeningDeal[] };
      setDeals(payload.deals ?? []);
    } catch (error) {
      console.error("Failed to load screening deals:", error);
      toast.error("Failed to load screening deals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Deal Screening</h1>
            <p className="text-sm text-muted-foreground">
              Intake, score, and prioritize new industrial deals across Louisiana.
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
            <Button
              variant="secondary"
              className="gap-2"
              onClick={loadDeals}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Apply
            </Button>
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
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading screening deals...
            </CardContent>
          </Card>
        ) : deals.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No screening deals found. Start with a new intake.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deals.map((deal) => {
              const score = deal.final_scores?.overall_score;
              const status = deal.latest_run?.status || "queued";
              return (
                <Card key={deal.project.id} className="transition-all hover:shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{deal.project.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {deal.project.address || "No address provided"}
                      </p>
                    </div>
                    <Badge variant={status === "complete" ? "secondary" : "outline"}>
                      {status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Overall Score</p>
                        <p className="text-lg font-semibold">
                          {score !== null && score !== undefined
                            ? score.toFixed(2)
                            : "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Needs Review</p>
                        <p className="text-sm font-medium">
                          {deal.latest_run?.needs_review ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Financial</p>
                        <p className="text-sm font-medium">
                          {deal.final_scores?.financial_score?.toFixed(2) ?? "--"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Qualitative</p>
                        <p className="text-sm font-medium">
                          {deal.final_scores?.qualitative_score?.toFixed(2) ?? "--"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Last update:{" "}
                        {deal.latest_run?.completed_at
                          ? formatDate(deal.latest_run.completed_at)
                          : "pending"}
                      </span>
                      {deal.latest_run?.needs_review && (
                        <Badge variant="destructive">Needs review</Badge>
                      )}
                    </div>
                    <Button asChild className="w-full">
                      <Link href={`/screening/${deal.project.id}`}>Open Deal</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
