"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
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

const SKU_OPTIONS = [
  { value: "SMALL_BAY_FLEX", label: "Small Bay Flex" },
  { value: "OUTDOOR_STORAGE", label: "Outdoor Storage" },
  { value: "TRUCK_PARKING", label: "Truck Parking" },
];

export default function DealsPage() {
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "table">("table");
  const [statusFilter, setStatusFilter] = useState("all");
  const [skuFilter, setSkuFilter] = useState("all");
  const [search, setSearch] = useState("");

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
    } catch (error) {
      console.error("Failed to load deals:", error);
      toast.error("Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, skuFilter, search]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

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

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals..."
              className="pl-9"
            />
          </div>

          <div className="flex rounded-md border">
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-r-none"
              onClick={() => setView("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-l-none"
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
                  <TableRow key={deal.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/deals/${deal.id}`}
                        className="font-medium hover:underline"
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
