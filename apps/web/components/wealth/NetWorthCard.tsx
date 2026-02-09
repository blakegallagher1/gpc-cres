"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

interface NetWorthCardProps {
  total: number;
  realEstate: number;
  cash: number;
  other: number;
  change: number;
  changePct: number;
}

export function NetWorthCard({
  total,
  realEstate,
  cash,
  other,
  change,
  changePct,
}: NetWorthCardProps) {
  const isPositive = change >= 0;
  const segments = [
    { label: "Real Estate", value: realEstate, color: "#3b82f6", pct: (realEstate / total) * 100 },
    { label: "Cash", value: cash, color: "#22c55e", pct: (cash / total) * 100 },
    { label: "Other", value: other, color: "#f59e0b", pct: (other / total) * 100 },
  ];

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white dark:from-slate-800 dark:to-slate-900">
      <CardContent className="p-8">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <p className="text-sm font-medium text-slate-400">Total Net Worth</p>
            <p className="mt-2 text-5xl font-bold tracking-tight">
              {formatCurrency(total).replace(".00", "")}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold",
                  isPositive
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                {isPositive ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" />
                )}
                {formatCurrency(Math.abs(change)).replace(".00", "")} ({Math.abs(changePct)}%)
              </span>
              <span className="text-sm text-slate-400">from last period</span>
            </div>
          </div>

          {/* Asset breakdown bar */}
          <div className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {segments.map((seg) => (
                <div
                  key={seg.label}
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${seg.pct}%`,
                    backgroundColor: seg.color,
                  }}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {segments.map((seg) => (
                <div key={seg.label} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-xs text-slate-400">{seg.label}</span>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatCurrency(seg.value).replace(".00", "")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
