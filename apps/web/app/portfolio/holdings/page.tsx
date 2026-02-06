"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building, Calendar, DollarSign } from "lucide-react";
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
import { MetricCard } from "@/components/portfolio/MetricCard";
import { mockDeals, SKU_CONFIG } from "@/lib/data/mockPortfolio";
import { formatCurrency } from "@/lib/utils";

// Holdings are APPROVED or EXITED deals
const holdings = mockDeals.filter(
  (d) => d.status === "APPROVED" || d.status === "EXITED"
);

// Mock NOI/debt data for holdings
const holdingsData = holdings.map((deal) => ({
  ...deal,
  noi: deal.estimatedValue * 0.08, // 8% cap rate approximation
  debtService: deal.estimatedValue * 0.05,
  acquisitionDate: deal.createdAt,
  leaseExpiry: "2028-12-31",
}));

const totalNOI = holdingsData.reduce((s, h) => s + h.noi, 0);
const totalDebt = holdingsData.reduce((s, h) => s + h.debtService, 0);
const totalValue = holdingsData.reduce((s, h) => s + h.estimatedValue, 0);
const totalAcreage = holdingsData.reduce((s, h) => s + h.acreage, 0);

export default function HoldingsPage() {
  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/portfolio"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Portfolio
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Holdings</h1>
        <p className="text-sm text-muted-foreground">
          Managed properties and stabilized assets
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Holdings"
          value={String(holdingsData.length)}
          icon={Building}
        />
        <MetricCard
          label="Total Acreage"
          value={`${totalAcreage.toFixed(1)} ac`}
          icon={Building}
        />
        <MetricCard
          label="Annual NOI"
          value={formatCurrency(totalNOI).replace(".00", "")}
          icon={DollarSign}
        />
        <MetricCard
          label="Net Cash Flow"
          value={formatCurrency(totalNOI - totalDebt).replace(".00", "")}
          subtitle="After debt service"
          icon={DollarSign}
        />
      </div>

      {/* Debt Service Summary */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Debt Service Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
              <p className="text-2xl font-bold">
                {formatCurrency(totalValue).replace(".00", "")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Annual Debt Service</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                ({formatCurrency(totalDebt).replace(".00", "")})
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">DSCR</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {(totalNOI / totalDebt).toFixed(2)}x
              </p>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-4 space-y-1">
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${((totalNOI - totalDebt) / totalNOI) * 100}%` }}
                title="Net Cash Flow"
              />
              <div
                className="h-full bg-red-400"
                style={{ width: `${(totalDebt / totalNOI) * 100}%` }}
                title="Debt Service"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Net Cash Flow ({((1 - totalDebt / totalNOI) * 100).toFixed(0)}%)</span>
              <span>Debt Service ({((totalDebt / totalNOI) * 100).toFixed(0)}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Holdings Table */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Property Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acreage</TableHead>
                <TableHead className="text-right">NOI</TableHead>
                <TableHead className="text-right">Debt Service</TableHead>
                <TableHead className="text-right">Net CF</TableHead>
                <TableHead className="text-right">Lease Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdingsData.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: SKU_CONFIG[h.sku].color }}
                      />
                      <span className="text-xs">{SKU_CONFIG[h.sku].label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={h.status === "APPROVED" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {h.status === "APPROVED" ? "Active" : "Exited"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.acreage.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(h.noi).replace(".00", "")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                    ({formatCurrency(h.debtService).replace(".00", "")})
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(h.noi - h.debtService).replace(".00", "")}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {h.leaseExpiry}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lease Expiration Timeline (placeholder) */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Lease Expiration Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[2026, 2027, 2028, 2029, 2030].map((year) => {
              const count = year === 2028 ? holdingsData.length : 0;
              return (
                <div key={year} className="flex items-center gap-3">
                  <span className="w-12 text-sm font-medium tabular-nums">{year}</span>
                  <div className="flex-1">
                    <div className="h-6 w-full rounded-sm bg-muted">
                      {count > 0 && (
                        <div
                          className="flex h-full items-center rounded-sm bg-amber-500/80 px-2"
                          style={{
                            width: `${(count / holdingsData.length) * 100}%`,
                          }}
                        >
                          <span className="text-xs font-semibold text-white">
                            {count} leases
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Timeline will populate as lease data is entered for each property.
          </p>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
