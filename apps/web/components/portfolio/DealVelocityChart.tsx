"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type PortfolioDeal,
  type SkuType,
  SKU_CONFIG,
  JURISDICTION_CONFIG,
} from "@/lib/data/portfolioConstants";

interface SkuDonutProps {
  deals: PortfolioDeal[];
}

export function SkuDonut({ deals }: SkuDonutProps) {
  const activeDeals = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );
  const skuCounts: Record<SkuType, number> = {
    SMALL_BAY_FLEX: 0,
    OUTDOOR_STORAGE: 0,
    TRUCK_PARKING: 0,
  };
  for (const deal of activeDeals) {
    skuCounts[deal.sku]++;
  }

  const total = activeDeals.length || 1;
  const entries = Object.entries(skuCounts) as [SkuType, number][];

  // Build SVG donut
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Deals by SKU</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative">
            <svg width="120" height="120" viewBox="0 0 100 100" className="shrink-0">
              {entries.map(([sku, count]) => {
                const pct = count / total;
                const dashLen = pct * circumference;
                const dashOffset = -offset * circumference;
                offset += pct;
                return (
                  <circle
                    key={sku}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={SKU_CONFIG[sku].color}
                    strokeWidth="12"
                    strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 50 50)"
                  />
                );
              })}
              {/* Center text */}
              <text
                x="50"
                y="47"
                textAnchor="middle"
                className="fill-foreground text-lg font-bold"
                fontSize="18"
              >
                {total}
              </text>
              <text
                x="50"
                y="60"
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="8"
              >
                Active
              </text>
            </svg>
          </div>
          <div className="space-y-2">
            {entries.map(([sku, count]) => (
              <div key={sku} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: SKU_CONFIG[sku].color }}
                />
                <span className="text-sm">
                  {SKU_CONFIG[sku].label}:{" "}
                  <span className="font-semibold">{count}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface JurisdictionBarProps {
  deals: PortfolioDeal[];
}

export function JurisdictionBar({ deals }: JurisdictionBarProps) {
  const activeDeals = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );
  const jurisdictionCounts: Record<string, number> = {};
  for (const deal of activeDeals) {
    jurisdictionCounts[deal.jurisdiction] =
      (jurisdictionCounts[deal.jurisdiction] || 0) + 1;
  }

  const entries = Object.entries(jurisdictionCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Deals by Jurisdiction</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {entries.map(([jurisdiction, count]) => {
            const config = JURISDICTION_CONFIG[jurisdiction] || {
              label: jurisdiction,
              color: "#6b7280",
            };
            return (
              <div key={jurisdiction} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{config.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      backgroundColor: config.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
