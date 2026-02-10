"use client";

import Link from "next/link";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetWorthCard } from "@/components/wealth/NetWorthCard";
import { EntityTree } from "@/components/wealth/EntityTree";
import { TaxAlertCard } from "@/components/wealth/TaxAlertCard";
import { type WealthEntity } from "@/lib/data/wealthTypes";
import { formatCurrency } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function WealthPage() {
  const { data: entitiesData, isLoading: entitiesLoading } = useSWR<{
    entities: Array<{
      id: string;
      name: string;
      entityType: string;
      parentId: string | null;
      ownershipPct: string;
      state: string | null;
      taxId: string | null;
      deals: Array<{ deal: { id: string; name: string } }>;
      _count: { taxEvents: number };
    }>;
  }>("/api/entities", fetcher);

  const { data: summaryData } = useSWR<{
    summary: {
      entityCount: number;
      totalDeals: number;
      totalAcreage: number;
      estimatedRealEstateValue: number;
      approvedDealCount: number;
      activeTaxAlerts: number;
    };
  }>("/api/wealth/summary", fetcher);

  const { data: taxData } = useSWR<{
    taxEvents: Array<{
      id: string;
      eventType: string;
      title: string;
      description: string | null;
      severity: string;
      deadline: string | null;
      status: string;
      entity: { id: string; name: string; entityType: string } | null;
      deal: { id: string; name: string } | null;
    }>;
  }>("/api/wealth/tax-events", fetcher);

  const isLoading = entitiesLoading;

  // Map API entities to component format
  const entities: WealthEntity[] = (entitiesData?.entities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.entityType as WealthEntity["type"],
    parentId: e.parentId,
    ownershipPct: Number(e.ownershipPct),
    taxId: e.taxId ?? undefined,
    state: e.state ?? "LA",
    associatedDealIds: e.deals.map((d) => d.deal.id),
  }));

  // Map tax events to alert format
  const taxAlerts = (taxData?.taxEvents ?? [])
    .filter((e) => e.status === "active")
    .slice(0, 4)
    .map((e) => {
      const daysRemaining = e.deadline
        ? Math.ceil(
            (new Date(e.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : undefined;
      return {
        id: e.id,
        type: e.eventType,
        title: e.title,
        description: e.description ?? "",
        severity: e.severity as "critical" | "warning" | "info",
        deadline: e.deadline ?? undefined,
        daysRemaining,
        entityName: e.entity?.name ?? "Unknown",
      };
    });

  const summary = summaryData?.summary;
  const estimatedValue = summary?.estimatedRealEstateValue ?? 0;

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal Wealth</h1>
          <p className="text-sm text-muted-foreground">
            Consolidated view of assets, entities, and tax strategy
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/wealth/entities"
            className="text-sm font-medium text-primary hover:underline"
          >
            Manage Entities →
          </Link>
          <Link
            href="/wealth/tax"
            className="text-sm font-medium text-primary hover:underline"
          >
            Tax Strategy →
          </Link>
        </div>
      </div>

      {/* Net Worth Card */}
      <NetWorthCard
        total={estimatedValue}
        realEstate={estimatedValue}
        cash={0}
        other={0}
        change={0}
        changePct={0}
      />

      {/* Entity Tree + Summary */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <EntityTree entities={entities} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Portfolio Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Entities</p>
                  <p className="text-2xl font-bold">{summary?.entityCount ?? 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Active Deals</p>
                  <p className="text-2xl font-bold">{summary?.totalDeals ?? 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Acreage</p>
                  <p className="text-2xl font-bold">{(summary?.totalAcreage ?? 0).toFixed(1)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Est. Value</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(estimatedValue).replace(".00", "")}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Approved Deals</p>
                <p className="text-lg font-semibold">{summary?.approvedDealCount ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Active Tax Alerts</p>
                <p className="text-lg font-semibold">{summary?.activeTaxAlerts ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Strategy Alerts */}
      {taxAlerts.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tax Strategy Alerts</h2>
            <Link
              href="/wealth/tax"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {taxAlerts.map((alert) => (
              <TaxAlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {entities.length === 0 && taxAlerts.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold">Get Started</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first entity to start tracking your corporate structure and tax strategy.
            </p>
            <Link
              href="/wealth/entities"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              Create Entity →
            </Link>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
