"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Clock, FileText, TrendingDown, MapPin, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaxAlertCard } from "@/components/wealth/TaxAlertCard";
import { type TaxAlert } from "@/lib/data/wealthTypes";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ApiTaxEvent {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  severity: string;
  deadline: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  entity: { id: string; name: string; entityType: string } | null;
  deal: { id: string; name: string } | null;
}

export default function TaxStrategyPage() {
  const { data, isLoading } = useSWR<{ taxEvents: ApiTaxEvent[] }>(
    "/api/wealth/tax-events",
    fetcher
  );

  const taxEvents = data?.taxEvents ?? [];

  // Map to TaxAlert format for TaxAlertCard
  const activeAlerts: TaxAlert[] = taxEvents
    .filter((e) => e.status === "active")
    .map((e) => {
      const daysRemaining = e.deadline
        ? Math.ceil(
            (new Date(e.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : undefined;
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        type: e.eventType,
        title: e.title,
        description: e.description ?? "",
        severity: e.severity as TaxAlert["severity"],
        deadline: e.deadline ?? undefined,
        daysRemaining,
        entityName: e.entity?.name ?? "Unknown",
        estimatedImpact: typeof meta.estimatedImpact === "number" ? meta.estimatedImpact : undefined,
      };
    });

  // Extract 1031 exchange events
  const exchanges = taxEvents.filter((e) => e.eventType === "1031_exchange");

  // Extract depreciation-related events
  const depreciationEvents = taxEvents.filter(
    (e) => e.eventType === "depreciation_recapture" || e.eventType === "cost_seg"
  );

  // Extract OZ events
  const ozEvents = taxEvents.filter((e) => e.eventType === "oz_deadline");

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
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/wealth"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Wealth Dashboard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Tax Strategy</h1>
        <p className="text-sm text-muted-foreground">
          Active exchanges, depreciation schedules, and tax planning
        </p>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Active Alerts</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {activeAlerts.map((alert) => (
              <TaxAlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* 1031 Exchanges */}
      {exchanges.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Active 1031 Exchanges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {exchanges.map((exchange) => {
                const meta = (exchange.metadata ?? {}) as Record<string, unknown>;
                const saleDate = meta.saleDate ? new Date(meta.saleDate as string) : null;
                const idDeadline = exchange.deadline ? new Date(exchange.deadline) : null;
                const closeDeadline = meta.closingDeadline
                  ? new Date(meta.closingDeadline as string)
                  : null;
                const salePrice = typeof meta.salePrice === "number" ? meta.salePrice : 0;
                const gain = typeof meta.gain === "number" ? meta.gain : 0;
                const candidateProperties = Array.isArray(meta.candidateProperties)
                  ? (meta.candidateProperties as string[])
                  : [];

                const now = new Date();
                let progressPct = 0;
                let idMarkPct = 25; // default
                if (saleDate && closeDeadline) {
                  const totalDays = Math.ceil(
                    (closeDeadline.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const elapsedDays = Math.ceil(
                    (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  progressPct = Math.min((elapsedDays / totalDays) * 100, 100);
                  if (idDeadline) {
                    const idDayMark = Math.ceil(
                      (idDeadline.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    idMarkPct = (idDayMark / totalDays) * 100;
                  }
                }

                return (
                  <div key={exchange.id} className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{exchange.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {exchange.entity?.name ?? "Unknown Entity"}
                          {salePrice > 0 &&
                            ` | Sale: ${formatCurrency(salePrice).replace(".00", "")}`}
                          {gain > 0 &&
                            ` | Gain: ${formatCurrency(gain).replace(".00", "")}`}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
                      >
                        Identification Period
                      </Badge>
                    </div>

                    {/* Timeline bar */}
                    {saleDate && closeDeadline && (
                      <div className="space-y-2">
                        <div className="relative h-4 w-full rounded-full bg-muted">
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full transition-all",
                              progressPct > idMarkPct ? "bg-blue-500" : "bg-amber-500"
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                            style={{ left: `${idMarkPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            Sale:{" "}
                            {saleDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          {idDeadline && (
                            <span className="text-red-600 dark:text-red-400">
                              ID:{" "}
                              {idDeadline.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              (45d)
                            </span>
                          )}
                          <span>
                            Close:{" "}
                            {closeDeadline.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            (180d)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Candidate properties */}
                    {candidateProperties.length > 0 && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Candidate Replacement Properties
                        </p>
                        <div className="space-y-1.5">
                          {candidateProperties.map((prop, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{prop}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Depreciation & Cost Segregation */}
      {depreciationEvents.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4" />
              Depreciation & Cost Segregation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {depreciationEvents.map((event) => {
                const meta = (event.metadata ?? {}) as Record<string, unknown>;
                const estimatedImpact =
                  typeof meta.estimatedImpact === "number" ? meta.estimatedImpact : 0;
                const basis = typeof meta.basis === "number" ? meta.basis : 0;
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.entity?.name ?? "Unknown Entity"}
                        {basis > 0 &&
                          ` | Basis: ${formatCurrency(basis).replace(".00", "")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {estimatedImpact > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Est. Impact</p>
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(estimatedImpact).replace(".00", "")}
                          </p>
                        </div>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          event.eventType === "cost_seg"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {event.eventType === "cost_seg"
                          ? "Cost Segregation"
                          : "Depreciation Recapture"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opportunity Zone Tracking */}
      {ozEvents.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Opportunity Zone Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ozEvents.map((event) => {
                const meta = (event.metadata ?? {}) as Record<string, unknown>;
                const investmentAmount =
                  typeof meta.investmentAmount === "number" ? meta.investmentAmount : 0;
                const holdPeriod =
                  typeof meta.holdPeriod === "string" ? meta.holdPeriod : "10+ years required";
                return (
                  <div key={event.id} className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-violet-500/10 p-2">
                        <MapPin className="h-5 w-5 text-violet-500" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.entity?.name ?? "Unknown Entity"}
                              {event.deal ? ` | ${event.deal.name}` : ""}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs"
                          >
                            Active OZ
                          </Badge>
                        </div>
                        {(investmentAmount > 0 || event.description) && (
                          <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3">
                            {investmentAmount > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Investment Amount
                                </p>
                                <p className="text-sm font-semibold">
                                  {formatCurrency(investmentAmount).replace(".00", "")}
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground">Hold Period</p>
                              <p className="text-sm font-semibold">{holdPeriod}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Tax Benefit</p>
                              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                Capital gains exclusion
                              </p>
                            </div>
                          </div>
                        )}
                        {event.description && (
                          <p className="text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {taxEvents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-semibold">No Tax Events</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tax events will appear here as you create entities and track deals through the pipeline.
            </p>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
