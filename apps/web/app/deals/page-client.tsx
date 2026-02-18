"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Download,
  Loader2,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DealCard, type DealSummary } from "@/components/deals/DealCard";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const DEAL_STATUSES = [
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
];

const DEAL_STATUS_LABEL: Record<string, string> = {
  INTAKE: "Intake",
  TRIAGE_DONE: "Triage Done",
  PREAPP: "Pre-App",
  CONCEPT: "Concept",
  NEIGHBORS: "Neighbors",
  SUBMITTED: "Submitted",
  HEARING: "Hearing",
  APPROVED: "Approved",
  EXIT_MARKETED: "Exit Marketing",
  EXITED: "Exited",
  KILLED: "Killed",
};

const RECENT_SEARCH_KEY = "deals-page-recent-searches";
const MAX_RECENT_SEARCHES = 8;

const SKU_OPTIONS = [
  { value: "SMALL_BAY_FLEX", label: "Small Bay Flex" },
  { value: "OUTDOOR_STORAGE", label: "Outdoor Storage" },
  { value: "TRUCK_PARKING", label: "Truck Parking" },
];

type TriageDecisionFilter = "all" | "ADVANCE" | "HOLD" | "KILL";

type DealsPageProps = {
  initialDeals?: DealSummary[];
  initialStatusFilter?: string;
  initialSkuFilter?: string;
  initialSearch?: string;
  initialTriageMode?: boolean;
};

function DealsPageContent({
  initialDeals = [],
  initialStatusFilter = "all",
  initialSkuFilter = "all",
  initialSearch = "",
  initialTriageMode = false,
}: DealsPageProps) {
  const [deals, setDeals] = useState<DealSummary[]>(initialDeals);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"grid" | "table">("table");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [skuFilter, setSkuFilter] = useState(initialSkuFilter);
  const [search, setSearch] = useState(initialSearch);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("INTAKE");
  const [bulkAction, setBulkAction] = useState<"delete" | "status" | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [triageDecisionFilter, setTriageDecisionFilter] =
    useState<TriageDecisionFilter>("all");
  const [triageMinScore, setTriageMinScore] = useState("");
  const [triageMaxScore, setTriageMaxScore] = useState("");
  const [triageNeedsReviewOnly, setTriageNeedsReviewOnly] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const triageMode = initialTriageMode;

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(RECENT_SEARCH_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        const normalized = Array.from(
          new Set(
            parsed
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean)
          )
        ).slice(0, MAX_RECENT_SEARCHES);
        setRecentSearches(normalized);
      }
    } catch {
      // ignore localStorage parse issues
    }
  }, []);

  const persistRecentSearch = useCallback((term: string) => {
    const normalizedTerm = term.trim();
    if (!normalizedTerm) return;

    setRecentSearches((previous) => {
      const next = [
        normalizedTerm,
        ...previous.filter((value) => value.toLowerCase() !== normalizedTerm.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      }

      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RECENT_SEARCH_KEY);
    }
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (skuFilter !== "all") params.set("sku", skuFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/deals?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load deals");
      const data = await res.json();
      setDeals(data.deals ?? []);

      if (search.trim()) {
        persistRecentSearch(search.trim());
      }
    } catch (error) {
      console.error("Failed to load deals:", error);
      toast.error("Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, skuFilter, search, persistRecentSearch]);

  const handleExportDeals = useCallback(() => {
    if (isExporting || deals.length === 0) return;

    setIsExporting(true);

    try {
      const escapeCsvCell = (value: string) =>
        `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      const headers = [
        "id",
        "name",
        "sku",
        "status",
        "jurisdiction",
        "triageTier",
        "createdAt",
      ];

      const rows = deals.map((deal) => [
        deal.id,
        deal.name,
        deal.sku,
        deal.status,
        deal.jurisdiction?.name ?? "",
        deal.triageTier ?? "",
        deal.createdAt,
      ]);

      const csv = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(",")),
      ].join("\n");

      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `deals-export-${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} deals.`);
    } catch {
      toast.error("Failed to export deals.");
    } finally {
      setIsExporting(false);
    }
  }, [deals, isExporting]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkAction("delete");

    const ids = [...selectedIds];

    try {
      const res = await fetch("/api/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "Failed to delete selected deals"
        );
      }

      toast.success(`Deleted ${payload?.updated ?? ids.length} deals.`);
      setSelectedIds(new Set());
      await loadDeals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete selected deals");
    } finally {
      setBulkAction(null);
    }
  }, [loadDeals, selectedIds]);

  const handleBulkUpdateStatus = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkAction("status");

    const ids = [...selectedIds];

    try {
      const res = await fetch("/api/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-status", status: bulkStatus, ids }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "Failed to update selected deals"
        );
      }

      toast.success(`Updated ${payload?.updated ?? ids.length} deals to ${DEAL_STATUS_LABEL[bulkStatus] ?? bulkStatus}`);
      setSelectedIds(new Set());
      await loadDeals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update selected deals");
    } finally {
      setBulkAction(null);
    }
  }, [bulkStatus, loadDeals, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === deals.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(deals.map((deal) => deal.id)));
  }, [deals, selectedIds.size]);

  const toggleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (view === "grid") {
      setSelectedIds(new Set());
    }
  }, [view]);

  useEffect(() => {
    setSelectedIds((previous) => {
      const activeIds = new Set(deals.map((deal) => deal.id));
      const next = new Set([...previous].filter((id) => activeIds.has(id)));
      if (next.size === previous.size) return previous;
      return next;
    });
  }, [deals]);

  const searchPreview = useMemo(
    () =>
      deals
        .filter((deal) => {
          if (!search.trim()) return false;
          const term = search.toLowerCase();
          return (
            deal.name.toLowerCase().includes(term) ||
            deal.jurisdiction?.name.toLowerCase().includes(term) ||
            deal.status.toLowerCase().includes(term)
          );
        })
        .slice(0, 4),
    [deals, search]
  );

  const triageModeDeals = useMemo(() => {
    const min =
      triageMinScore.trim() === "" ? Number.NaN : Number(triageMinScore);
    const max =
      triageMaxScore.trim() === "" ? Number.NaN : Number(triageMaxScore);
    return deals.filter((deal) => {
      const decision = deal.triageTier ?? "UNSCORED";

      if (triageDecisionFilter !== "all" && decision !== triageDecisionFilter) {
        return false;
      }

      const normalizedScore =
        typeof deal.triageScore === "number"
          ? (deal.triageScore > 1 ? deal.triageScore : deal.triageScore * 100)
          : null;

      if (triageNeedsReviewOnly && decision !== "HOLD") {
        return false;
      }

      if (!Number.isNaN(min) && normalizedScore !== null && normalizedScore < min) {
        return false;
      }
      if (!Number.isNaN(max) && normalizedScore !== null && normalizedScore > max) {
        return false;
      }

      return true;
    });
  }, [deals, triageDecisionFilter, triageNeedsReviewOnly, triageMinScore, triageMaxScore]);

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    loadDeals();
  }, [loadDeals]);

  if (triageMode) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Triage Queue</h1>
            <p className="text-sm text-muted-foreground">
              Card-based triage queue with decision and score filters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={triageDecisionFilter}
              onValueChange={(value) =>
                setTriageDecisionFilter(value as TriageDecisionFilter)
              }
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="ADVANCE">ADVANCE</SelectItem>
                <SelectItem value="HOLD">HOLD</SelectItem>
                <SelectItem value="KILL">KILL</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={triageMinScore}
              onChange={(e) => setTriageMinScore(e.target.value)}
              placeholder="Min score"
              type="number"
              min={0}
              max={100}
              className="w-28"
            />
            <Input
              value={triageMaxScore}
              onChange={(e) => setTriageMaxScore(e.target.value)}
              placeholder="Max score"
              type="number"
              min={0}
              max={100}
              className="w-28"
            />

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={triageNeedsReviewOnly}
                onCheckedChange={(checked) =>
                  setTriageNeedsReviewOnly(checked === true)
                }
              />
              Review only
            </label>

            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => router.push(pathname)}
            >
              Exit Triage View
            </Button>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Loading triage queue...
              </CardContent>
            </Card>
          ) : triageModeDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">
                  No matching triage candidates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Review Flag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {triageModeDeals.map((deal) => {
                    const scoreValue =
                      typeof deal.triageScore === "number"
                        ? deal.triageScore > 1
                          ? deal.triageScore
                          : deal.triageScore * 100
                        : null;
                    const needsReview = deal.triageTier === "HOLD";

                    return (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <Link
                            href={`/deals/${deal.id}`}
                            className="font-medium hover:underline"
                          >
                            {deal.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <TriageIndicator tier={deal.triageTier} showLabel />
                        </TableCell>
                        <TableCell>
                          {scoreValue === null ? "—" : scoreValue.toFixed(1)}
                        </TableCell>
                        <TableCell>{needsReview ? "Needs review" : "Clear"}</TableCell>
                        <TableCell>
                          <StatusBadge status={deal.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(deal.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/deals/${deal.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Deals</h1>
            <p className="text-sm text-muted-foreground">
              Manage entitlement deals across your pipeline.
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/deals/new">
              <Plus className="h-4 w-4" />
              New Deal
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DEAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={skuFilter} onValueChange={setSkuFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All SKUs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SKUs</SelectItem>
              {SKU_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals"
              className="pl-9"
            />
          </div>

          <div className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
            {search.trim() === "" && recentSearches.length > 0 && (
              <div className="mr-auto flex w-full flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Recent</span>
                {recentSearches.map((term) => (
                  <Button
                    key={term}
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSearch(term)}
                  >
                    {term}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={clearRecentSearches}
                >
                  Clear
                </Button>
              </div>
            )}

            <div className="flex rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-r-none"
                onClick={handleExportDeals}
                disabled={isExporting || deals.length === 0}
                aria-label="Export deals to CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-none"
                onClick={() => setView("table")}
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-l-none"
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {search.trim() && searchPreview.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-3">
              <p className="text-sm font-medium">Search preview</p>
              <div className="space-y-2">
                {searchPreview.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between gap-2 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground"
                  >
                    <span className="truncate">{deal.name}</span>
                    <span>{deal.sku}</span>
                    <span>{deal.jurisdiction?.name ?? "Unknown"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk actions */}
        {selectedIds.size > 0 && view === "table" && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 py-3">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Bulk status" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {DEAL_STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkUpdateStatus}
                disabled={bulkAction === "status"}
              >
                {bulkAction === "status" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Update status
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkAction === "delete"}
              >
                {bulkAction === "delete" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Delete selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading deals...
            </CardContent>
          </Card>
        ) : deals.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">
                No deals yet. Create your first deal or ask the chat to create one.
              </p>
              <Button asChild className="mt-4 gap-2">
                <Link href="/deals/new">
                  <Plus className="h-4 w-4" />
                  New Deal
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : view === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        deals.length > 0 && selectedIds.size === deals.length
                          ? true
                          : selectedIds.size > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all deals"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Triage</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/deals/${deal.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/deals/${deal.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(deal.id)}
                        onCheckedChange={(checked) =>
                          toggleSelectOne(deal.id, checked === true || checked === "indeterminate")
                        }
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${deal.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/deals/${deal.id}`}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {deal.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SkuBadge sku={deal.sku} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={deal.status} />
                    </TableCell>
                    <TableCell>
                      {deal.jurisdiction?.name ?? "--"}
                    </TableCell>
                    <TableCell>
                      <TriageIndicator tier={deal.triageTier} showLabel />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(deal.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

export default function DealsPage({
  initialDeals = [],
  initialStatusFilter = "all",
  initialSkuFilter = "all",
  initialSearch = "",
  initialTriageMode = false,
}: DealsPageProps) {
  return (
    <DealsPageContent
      initialDeals={initialDeals}
      initialStatusFilter={initialStatusFilter}
      initialSkuFilter={initialSkuFilter}
      initialSearch={initialSearch}
      initialTriageMode={initialTriageMode}
    />
  );
}
