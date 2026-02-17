"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProFormaResults } from "@/hooks/useProFormaCalculations";

function fmt(value: number, style: "currency" | "percent" | "number" = "number"): string {
  if (style === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (style === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ResultsDashboard({ results }: { results: ProFormaResults }) {
  const {
    acquisitionBasis: ab,
    annualCashFlows,
    exitAnalysis: ex,
    leveredIRR,
    unleveredIRR,
    equityMultiple,
    cashOnCashYear1,
    netProfit,
    goingInCapRate,
    annualDebtService,
    dscr,
    weightedAverageLeaseTermYears,
    sourcesAndUses,
  } = results;

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          label="Levered IRR"
          value={leveredIRR !== null ? fmt(leveredIRR, "percent") : "N/A"}
        />
        <MetricCard
          label="Unlevered IRR"
          value={unleveredIRR !== null ? fmt(unleveredIRR, "percent") : "N/A"}
        />
        <MetricCard
          label="Equity Multiple"
          value={`${equityMultiple.toFixed(2)}x`}
        />
        <MetricCard
          label="Cash-on-Cash Y1"
          value={fmt(cashOnCashYear1, "percent")}
        />
        <MetricCard
          label="Net Profit"
          value={fmt(netProfit, "currency")}
        />
        <MetricCard
          label="Going-In Cap"
          value={fmt(goingInCapRate, "percent")}
          sub={`DSCR: ${dscr >= 999 ? "N/A" : dscr.toFixed(2)}x`}
        />
        <MetricCard
          label="WALT"
          value={`${weightedAverageLeaseTermYears.toFixed(2)} yrs`}
        />
      </div>

      {/* Acquisition Basis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Acquisition Basis</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Purchase Price</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ab.purchasePrice, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Closing Costs</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ab.closingCosts, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Development Budget</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ab.developmentCosts, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Loan Fees</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ab.loanFees, "currency")}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total Basis</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(ab.totalBasis, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Loan Amount</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ab.loanAmount, "currency")}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Equity Required</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(ab.equityRequired, "currency")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            Annual Debt Service: {fmt(annualDebtService, "currency")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sources & Uses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Total Uses</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sourcesAndUses.totalUses, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Debt Sources</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sourcesAndUses.debtSources, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Equity Sources</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sourcesAndUses.equitySources, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Other Sources</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sourcesAndUses.otherSources, "currency")}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total Sources</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(sourcesAndUses.totalSources, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Sources - Uses Delta</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    sourcesAndUses.usesDelta === 0
                      ? "text-muted-foreground"
                      : sourcesAndUses.usesDelta > 0
                        ? "text-green-600"
                        : "text-destructive"
                  }`}
                >
                  {fmt(sourcesAndUses.usesDelta, "currency")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Annual Cash Flows */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Annual Cash Flows</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Year</TableHead>
                <TableHead className="text-right">NOI</TableHead>
                <TableHead className="text-right">Debt Service</TableHead>
                <TableHead className="text-right">Levered CF</TableHead>
                <TableHead className="text-right">Cumulative CF</TableHead>
                <TableHead className="text-right">CoC Return</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {annualCashFlows.map((cf) => (
                <TableRow key={cf.year}>
                  <TableCell className="font-medium">{cf.year}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(cf.noi, "currency")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(cf.debtService, "currency")}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${cf.leveredCashFlow < 0 ? "text-destructive" : ""}`}
                  >
                    {fmt(cf.leveredCashFlow, "currency")}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${cf.cumulativeCashFlow < 0 ? "text-destructive" : ""}`}
                  >
                    {fmt(cf.cumulativeCashFlow, "currency")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(cf.cashOnCash, "percent")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Exit Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Exit Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Exit Year NOI</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ex.exitNoi, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Sale Price</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(ex.salePrice, "currency")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Disposition Costs</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  ({fmt(ex.dispositionCosts, "currency")})
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Loan Payoff</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  ({fmt(ex.loanPayoff, "currency")})
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Net Proceeds</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(ex.netProceeds, "currency")}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total Profit</TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums ${ex.profit < 0 ? "text-destructive" : "text-green-600"}`}
                >
                  {fmt(ex.profit, "currency")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
