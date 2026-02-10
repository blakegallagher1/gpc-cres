"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Building, DollarSign, Loader2 } from "lucide-react";
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
import { SKU_CONFIG, type SkuType } from "@/lib/data/portfolioConstants";
import { formatCurrency } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function HoldingsPage() {
  const { data, isLoading } = useSWR<{
    deals: Array<{
      id: string;
      name: string;
      sku: SkuType;
      status: string;
      jurisdiction: string;
      acreage: number;
      triageScore: number | null;
      updatedAt: string;
      createdAt: string;
    }>;
  }>("/api/portfolio", fetcher);

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  // Holdings = APPROVED or EXITED deals
  const holdings = (data?.deals ?? []).filter(
    (d) => d.status === "APPROVED" || d.status === "EXITED"
  );

  // Estimate NOI/debt from acreage (rough approximation until real financial data is added)
  const holdingsData = holdings.map((deal) => {
    const estimatedValue = deal.acreage * 50000; // $50K/acre rough average
    return {
      ...deal,
      estimatedValue,
      noi: estimatedValue * 0.08, // 8% cap rate
      debtService: estimatedValue * 0.05, // 5% debt service ratio
    };
  });

  const totalNOI = holdingsData.reduce((s, h) => s + h.noi, 0);
  const totalDebt = holdingsData.reduce((s, h) => s + h.debtService, 0);
  const totalValue = holdingsData.reduce((s, h) => s + h.estimatedValue, 0);
  const totalAcreage = holdingsData.reduce((s, h) => s + h.acreage, 0);

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

      {holdingsData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Holdings Yet</h3>
            <p className="text-sm text-muted-foreground">
              Deals will appear here once they reach APPROVED or EXITED status.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
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
              label="Annual NOI (est.)"
              value={formatCurrency(totalNOI).replace(".00", "")}
              icon={DollarSign}
            />
            <MetricCard
              label="Net Cash Flow (est.)"
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
                  <p className="text-sm text-muted-foreground">Est. Portfolio Value</p>
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
                    {totalDebt > 0 ? (totalNOI / totalDebt).toFixed(2) : "N/A"}x
                  </p>
                </div>
              </div>
              {totalNOI > 0 && (
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
              )}
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
                    <TableHead className="text-right">NOI (est.)</TableHead>
                    <TableHead className="text-right">Debt Service</TableHead>
                    <TableHead className="text-right">Net CF</TableHead>
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
                            style={{ backgroundColor: SKU_CONFIG[h.sku]?.color }}
                          />
                          <span className="text-xs">{SKU_CONFIG[h.sku]?.label ?? h.sku}</span>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                NOI and debt service are estimates based on acreage. Add financial data to deals for accurate figures.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}
