"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { DebtMaturityWall as DebtMaturityWallData } from "@/lib/services/portfolioAnalytics.service";

function riskBadge(score: number) {
  if (score >= 70) return "bg-red-100 text-red-700 border-red-200";
  if (score >= 40) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export function DebtMaturityWall({ data }: { data: DebtMaturityWallData }) {
  return (
    <div className="space-y-4">
      {data.alert ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Alert: {data.debtMaturing12MonthsPct.toFixed(1)}% of portfolio debt matures within 12 months.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Portfolio Debt</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(data.totalPortfolioDebt)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Maturing in 12 Months</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(data.debtMaturing12Months)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">12-Month Maturity Share</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {data.debtMaturing12MonthsPct.toFixed(1)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Debt Maturity by Quarter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.quarters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No financing maturities found.
            </p>
          ) : (
            data.quarters.map((row) => (
              <div
                key={row.quarter}
                className="grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-4"
              >
                <div>
                  <p className="text-xs text-muted-foreground">Quarter</p>
                  <p className="font-medium">{row.quarter}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Debt Maturing</p>
                  <p className="font-medium">{formatCurrency(row.totalDebtMaturing)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Deals Affected</p>
                  <p className="font-medium">{row.dealsAffected}</p>
                </div>
                <div className="flex items-end">
                  <Badge variant="outline" className={riskBadge(row.refinanceRiskScore)}>
                    Risk {row.refinanceRiskScore}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
