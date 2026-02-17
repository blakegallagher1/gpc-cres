"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  modelExitScenarios,
  type ExitScenarioTiming,
  type ProFormaContext,
} from "@/hooks/useProFormaCalculations";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPercent(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatTiming(timing: ExitScenarioTiming | null): string {
  if (!timing) {
    return "N/A";
  }
  if (timing.refinanceYear !== null) {
    return `Refi Y${timing.refinanceYear} -> Exit Y${timing.exitYear}`;
  }
  return `Sell Y${timing.exitYear}`;
}

export function ExitAnalysisView({
  assumptions,
  context,
}: {
  assumptions: FinancialModelAssumptions;
  context?: ProFormaContext;
}) {
  const analysis = useMemo(
    () => modelExitScenarios(assumptions, context),
    [assumptions, context],
  );

  const rankedTopRows = analysis.rankedScenarios.slice(0, 20);
  const chartRows = analysis.rankedScenarios
    .filter((scenario) => scenario.irr !== null)
    .slice(0, 12)
    .map((scenario, index) => ({
      rank: index + 1,
      label: scenario.label,
      irr: scenario.irr ?? 0,
      equityMultiple: scenario.equityMultiple,
    }));

  const bestScenario = analysis.rankedScenarios[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">IRR-Max Sell Timing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {formatTiming(analysis.sellStrategy.bestTiming)}
            </p>
            <p className="text-xs text-muted-foreground">
              IRR: {fmtPercent(analysis.sellStrategy.bestIrr)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">IRR-Max Refi Timing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {formatTiming(analysis.refinanceStrategy.bestTiming)}
            </p>
            <p className="text-xs text-muted-foreground">
              IRR: {fmtPercent(analysis.refinanceStrategy.bestIrr)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Disposition at Stabilization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {formatTiming(analysis.stabilizationStrategy.timing)}
            </p>
            <p className="text-xs text-muted-foreground">
              IRR: {fmtPercent(analysis.stabilizationStrategy.irr)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Scenario Comparison (Top IRR Scenarios)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No valid IRR scenarios available for charting.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, chartRows.length * 34)}>
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 180, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                  fontSize={11}
                />
                <YAxis
                  type="category"
                  width={170}
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, key) => {
                    const numeric = typeof value === "number" ? value : 0;
                    if (key === "irr") {
                      return [`${(numeric * 100).toFixed(2)}%`, "IRR"];
                    }
                    return [`${numeric.toFixed(2)}x`, "Equity Multiple"];
                  }}
                />
                <Bar dataKey="irr" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ranked Exit Scenarios</CardTitle>
        </CardHeader>
        <CardContent>
          {bestScenario && (
            <p className="text-xs text-muted-foreground mb-2">
              Top scenario: <span className="font-medium">{bestScenario.label}</span>{" "}
              ({fmtPercent(bestScenario.irr)} IRR, {bestScenario.equityMultiple.toFixed(2)}x)
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead className="text-right">Exit Value</TableHead>
                <TableHead className="text-right">Equity Proceeds</TableHead>
                <TableHead className="text-right">Equity Multiple</TableHead>
                <TableHead className="text-right">IRR</TableHead>
                <TableHead className="text-right">IRR-Max Timing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankedTopRows.map((scenario, index) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{scenario.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCurrency(scenario.exitValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtCurrency(scenario.equityProceeds)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {scenario.equityMultiple.toFixed(2)}x
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPercent(scenario.irr)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTiming(scenario.irrMaximizingExitTiming)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

