"use client";

import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetWorthCard } from "@/components/wealth/NetWorthCard";
import { EntityTree } from "@/components/wealth/EntityTree";
import { CashFlowWaterfall } from "@/components/wealth/CashFlowWaterfall";
import { TaxAlertCard } from "@/components/wealth/TaxAlertCard";
import {
  mockEntities,
  mockNetWorth,
  mockCashFlow,
  mockCapitalAllocation,
  mockTaxAlerts,
} from "@/lib/data/mockWealth";
import { formatCurrency } from "@/lib/utils";

export default function WealthPage() {
  const totalAllocation = mockCapitalAllocation.reduce((s, a) => s + a.value, 0);

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

      {/* Net Worth Card - Full Width */}
      <NetWorthCard
        total={mockNetWorth.total}
        realEstate={mockNetWorth.realEstate}
        cash={mockNetWorth.cash}
        other={mockNetWorth.other}
        change={mockNetWorth.change}
        changePct={mockNetWorth.changePct}
      />

      {/* Entity Tree + Capital Allocation */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <EntityTree entities={mockEntities} />

        {/* Capital Allocation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Capital Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Donut Chart */}
              <div className="relative shrink-0">
                <svg width="140" height="140" viewBox="0 0 100 100">
                  {(() => {
                    const radius = 38;
                    const circumference = 2 * Math.PI * radius;
                    let offset = 0;
                    return mockCapitalAllocation.map((item) => {
                      const pct = item.value / totalAllocation;
                      const dashLen = pct * circumference;
                      const dashOffset = -offset * circumference;
                      offset += pct;
                      return (
                        <circle
                          key={item.label}
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="none"
                          stroke={item.color}
                          strokeWidth="14"
                          strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                          strokeDashoffset={dashOffset}
                          transform="rotate(-90 50 50)"
                        />
                      );
                    });
                  })()}
                  <text
                    x="50"
                    y="47"
                    textAnchor="middle"
                    className="fill-foreground font-bold"
                    fontSize="12"
                  >
                    {formatCurrency(totalAllocation / 1_000_000).replace("$", "$").replace(".00", "")}M
                  </text>
                  <text
                    x="50"
                    y="60"
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="7"
                  >
                    Total
                  </text>
                </svg>
              </div>

              {/* Legend */}
              <div className="space-y-3 flex-1">
                {mockCapitalAllocation.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm">{item.label}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {item.pct}%
                      </span>
                    </div>
                    <div className="ml-5">
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(item.value).replace(".00", "")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Waterfall */}
      <div className="mt-6">
        <CashFlowWaterfall items={mockCashFlow} />
      </div>

      {/* Tax Strategy Alerts */}
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
          {mockTaxAlerts.map((alert) => (
            <TaxAlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
