"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { CapitalDeploymentAnalytics } from "@/lib/services/portfolioAnalytics.service";

export function CapitalDeploymentTracker({
  data,
}: {
  data: CapitalDeploymentAnalytics;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Committed vs Deployed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Committed</span>
              <span className="font-semibold">{formatCurrency(data.totalCommitted)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Deployed</span>
              <span className="font-semibold">{formatCurrency(data.totalDeployed)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unit Deployment Cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost / Active Parcel</span>
              <span className="font-semibold">{formatCurrency(data.costPerActiveParcel)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost / Acre</span>
              <span className="font-semibold">{formatCurrency(data.costPerAcre)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sunk / Non-Recoverable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Non-Recoverable Total</span>
              <span className="font-semibold">{formatCurrency(data.totalNonRecoverable)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Killed Deal Sunk Cost</span>
              <span className="font-semibold">{formatCurrency(data.sunkCostKilledDeals)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Deployment Efficiency by Stage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.stageRollup.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capital deployment records yet.</p>
          ) : (
            data.stageRollup.map((row) => (
              <div key={row.stage} className="rounded border p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">{row.stage}</p>
                  <p className="text-muted-foreground">entries: {row.entries}</p>
                </div>
                <div className="grid gap-1 md:grid-cols-4">
                  <div>Committed: {formatCurrency(row.committed)}</div>
                  <div>Deployed: {formatCurrency(row.deployed)}</div>
                  <div>Non-Recoverable: {formatCurrency(row.nonRecoverable)}</div>
                  <div>Efficiency: {row.efficiencyPct.toFixed(1)}%</div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(row.efficiencyPct, 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

