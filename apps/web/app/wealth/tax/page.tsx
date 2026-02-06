"use client";

import Link from "next/link";
import { ArrowLeft, Clock, FileText, TrendingDown, MapPin } from "lucide-react";
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
import {
  mockTaxAlerts,
  mockDepreciation,
  mock1031Exchanges,
} from "@/lib/data/mockWealth";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function TaxStrategyPage() {
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
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Active Alerts</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {mockTaxAlerts.map((alert) => (
            <TaxAlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      </div>

      {/* 1031 Exchanges */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Active 1031 Exchanges
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mock1031Exchanges.map((exchange) => {
            const saleDate = new Date(exchange.saleDate);
            const idDeadline = new Date(exchange.identificationDeadline);
            const closeDeadline = new Date(exchange.closingDeadline);
            const now = new Date();
            const totalDays = Math.ceil(
              (closeDeadline.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            const elapsedDays = Math.ceil(
              (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            const idDayMark = Math.ceil(
              (idDeadline.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            const progressPct = Math.min((elapsedDays / totalDays) * 100, 100);
            const idMarkPct = (idDayMark / totalDays) * 100;

            return (
              <div key={exchange.id} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {exchange.propertyRelinquished}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sale Price: {formatCurrency(exchange.salePrice).replace(".00", "")} |
                      Gain: {formatCurrency(exchange.gain).replace(".00", "")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      exchange.status === "identification"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    )}
                  >
                    {exchange.status === "identification"
                      ? "Identification Period"
                      : exchange.status}
                  </Badge>
                </div>

                {/* Timeline bar */}
                <div className="space-y-2">
                  <div className="relative h-4 w-full rounded-full bg-muted">
                    {/* Elapsed progress */}
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-all",
                        progressPct > idMarkPct
                          ? "bg-blue-500"
                          : "bg-amber-500"
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                    {/* 45-day marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                      style={{ left: `${idMarkPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Sale: {saleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      ID: {idDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (45d)
                    </span>
                    <span>
                      Close: {closeDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (180d)
                    </span>
                  </div>
                </div>

                {/* Candidate properties */}
                {exchange.candidateProperties.length > 0 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Candidate Replacement Properties
                    </p>
                    <div className="space-y-1.5">
                      {exchange.candidateProperties.map((prop, i) => (
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
        </CardContent>
      </Card>

      {/* Depreciation Schedule */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" />
            Depreciation Schedule Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Basis</TableHead>
                <TableHead className="text-right">Annual Deduction</TableHead>
                <TableHead className="text-right">Accumulated</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDepreciation.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.propertyName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.entityName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {row.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.basis).replace(".00", "")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(row.annualDeduction).replace(".00", "")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.accumulatedDepr).replace(".00", "")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.remainingBasis).replace(".00", "")}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="font-semibold border-t-2">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(
                    mockDepreciation.reduce((s, r) => s + r.basis, 0)
                  ).replace(".00", "")}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(
                    mockDepreciation.reduce((s, r) => s + r.annualDeduction, 0)
                  ).replace(".00", "")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(
                    mockDepreciation.reduce((s, r) => s + r.accumulatedDepr, 0)
                  ).replace(".00", "")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(
                    mockDepreciation.reduce((s, r) => s + r.remainingBasis, 0)
                  ).replace(".00", "")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Opportunity Zone Tracking */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Opportunity Zone Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2">
                <MapPin className="h-5 w-5 text-violet-500" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Walker South Industrial</p>
                    <p className="text-xs text-muted-foreground">
                      GPC Opportunity Zone LLC | Livingston Parish
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs"
                  >
                    Active OZ
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Investment Amount</p>
                    <p className="text-sm font-semibold">$410,000</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hold Period</p>
                    <p className="text-sm font-semibold">10+ years required</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tax Benefit</p>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Capital gains exclusion
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gains invested by 12/31/2026 qualify for partial deferral. Hold for 10+ years for full
                  capital gains exclusion on appreciation.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Segregation Candidates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Cost Segregation Candidates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                name: "Plank Rd Flex Suites",
                basis: 740_000,
                estimatedBenefit: 120_000,
                status: "Recommended",
              },
              {
                name: "Airline Hwy Flex Park",
                basis: 680_000,
                estimatedBenefit: 95_000,
                status: "Under Review",
              },
            ].map((candidate, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{candidate.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Basis: {formatCurrency(candidate.basis).replace(".00", "")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Est. 1st Year Benefit</p>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(candidate.estimatedBenefit).replace(".00", "")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      candidate.status === "Recommended"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {candidate.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
