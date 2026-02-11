"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";
import { computeProForma } from "@/hooks/useProFormaCalculations";

// ---------------------------------------------------------------------------
// Assumption perturbation definitions
// ---------------------------------------------------------------------------

interface AssumptionDef {
  key: string;
  label: string;
  getter: (a: FinancialModelAssumptions) => number;
  setter: (a: FinancialModelAssumptions, v: number) => FinancialModelAssumptions;
}

function nestedSet(
  a: FinancialModelAssumptions,
  cat: string,
  field: string,
  v: number
): FinancialModelAssumptions {
  const sub = a[cat as keyof FinancialModelAssumptions];
  if (typeof sub === "object" && sub !== null) {
    return { ...a, [cat]: { ...sub, [field]: v } };
  }
  return { ...a, [cat]: v };
}

const ASSUMPTIONS: AssumptionDef[] = [
  {
    key: "purchasePrice",
    label: "Purchase Price",
    getter: (a) => a.acquisition.purchasePrice,
    setter: (a, v) => nestedSet(a, "acquisition", "purchasePrice", v),
  },
  {
    key: "rentPerSf",
    label: "Rent / SF",
    getter: (a) => a.income.rentPerSf,
    setter: (a, v) => nestedSet(a, "income", "rentPerSf", v),
  },
  {
    key: "vacancyPct",
    label: "Vacancy",
    getter: (a) => a.income.vacancyPct,
    setter: (a, v) => nestedSet(a, "income", "vacancyPct", v),
  },
  {
    key: "rentGrowthPct",
    label: "Rent Growth",
    getter: (a) => a.income.rentGrowthPct,
    setter: (a, v) => nestedSet(a, "income", "rentGrowthPct", v),
  },
  {
    key: "opexPerSf",
    label: "OpEx / SF",
    getter: (a) => a.expenses.opexPerSf,
    setter: (a, v) => nestedSet(a, "expenses", "opexPerSf", v),
  },
  {
    key: "exitCapRate",
    label: "Exit Cap Rate",
    getter: (a) => a.exit.exitCapRate,
    setter: (a, v) => nestedSet(a, "exit", "exitCapRate", v),
  },
  {
    key: "ltvPct",
    label: "LTV",
    getter: (a) => a.financing.ltvPct,
    setter: (a, v) => nestedSet(a, "financing", "ltvPct", v),
  },
  {
    key: "interestRate",
    label: "Interest Rate",
    getter: (a) => a.financing.interestRate,
    setter: (a, v) => nestedSet(a, "financing", "interestRate", v),
  },
  {
    key: "buildableSf",
    label: "Buildable SF",
    getter: (a) => a.buildableSf,
    setter: (a, v) => ({ ...a, buildableSf: v }),
  },
  {
    key: "holdYears",
    label: "Hold Period",
    getter: (a) => a.exit.holdYears,
    setter: (a, v) => nestedSet(a, "exit", "holdYears", Math.max(1, Math.round(v))),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TornadoBar {
  label: string;
  low: number;  // IRR at -20% of base assumption
  high: number; // IRR at +20% of base assumption
  lowLabel: string;
  highLabel: string;
  range: number;
}

export function TornadoChart({
  assumptions,
}: {
  assumptions: FinancialModelAssumptions;
}) {
  const baseIRR = useMemo(() => {
    const r = computeProForma(assumptions);
    return r.leveredIRR;
  }, [assumptions]);

  const bars = useMemo(() => {
    if (baseIRR === null) return [];

    const result: TornadoBar[] = [];

    for (const def of ASSUMPTIONS) {
      const baseVal = def.getter(assumptions);
      if (baseVal === 0) continue; // Skip zero-base assumptions (can't perturb by %)

      const lowAssumption = def.setter(assumptions, baseVal * 0.8);
      const highAssumption = def.setter(assumptions, baseVal * 1.2);

      const lowResult = computeProForma(lowAssumption);
      const highResult = computeProForma(highAssumption);

      const lowIRR = lowResult.leveredIRR ?? baseIRR;
      const highIRR = highResult.leveredIRR ?? baseIRR;

      // Ensure low < high for display
      const actualLow = Math.min(lowIRR, highIRR);
      const actualHigh = Math.max(lowIRR, highIRR);

      result.push({
        label: def.label,
        low: actualLow,
        high: actualHigh,
        lowLabel: `${(actualLow * 100).toFixed(1)}%`,
        highLabel: `${(actualHigh * 100).toFixed(1)}%`,
        range: actualHigh - actualLow,
      });
    }

    // Sort by range, widest first
    result.sort((a, b) => b.range - a.range);
    return result;
  }, [assumptions, baseIRR]);

  if (baseIRR === null) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sensitivity Tornado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cannot compute IRR for current assumptions.</p>
        </CardContent>
      </Card>
    );
  }

  // Recharts data for stacked bar
  const chartData = bars.map((b) => ({
    name: b.label,
    // Offset from base: left side (negative) and right side (positive)
    leftOffset: b.low - baseIRR,
    rightOffset: b.high - baseIRR,
    lowLabel: b.lowLabel,
    highLabel: b.highLabel,
    low: b.low,
    high: b.high,
  }));

  const minVal = Math.min(...bars.map((b) => b.low), baseIRR) - 0.02;
  const maxVal = Math.max(...bars.map((b) => b.high), baseIRR) + 0.02;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Sensitivity Tornado</CardTitle>
          <span className="text-xs text-muted-foreground">
            Base IRR: {(baseIRR * 100).toFixed(1)}% | Assumptions at +/-20%
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(280, bars.length * 36)}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 60, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[minVal, maxVal]}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={75}
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : 0;
                if (name === "Downside") return [`${(v * 100).toFixed(1)}%`, "Downside IRR"];
                return [`${(v * 100).toFixed(1)}%`, "Upside IRR"];
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <ReferenceLine
              x={baseIRR}
              stroke="#6b7280"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: "Base", position: "top", fontSize: 10 }}
            />
            <Bar dataKey="low" name="Downside" stackId="range" fill="transparent">
              {chartData.map((_, i) => (
                <Cell key={i} fill="transparent" />
              ))}
            </Bar>
            <Bar dataKey="high" name="Upside" stackId="none">
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.high >= baseIRR ? "#22c55e" : "#ef4444"}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Fallback: simple table for clarity */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-1.5 text-left font-medium text-muted-foreground">Assumption</th>
                <th className="p-1.5 text-center font-medium text-muted-foreground">-20% IRR</th>
                <th className="p-1.5 text-center font-medium text-muted-foreground">Base IRR</th>
                <th className="p-1.5 text-center font-medium text-muted-foreground">+20% IRR</th>
                <th className="p-1.5 text-center font-medium text-muted-foreground">Range</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label} className="border-b last:border-0">
                  <td className="p-1.5 font-medium">{b.label}</td>
                  <td className="p-1.5 text-center tabular-nums text-red-600">
                    {b.lowLabel}
                  </td>
                  <td className="p-1.5 text-center tabular-nums">
                    {(baseIRR * 100).toFixed(1)}%
                  </td>
                  <td className="p-1.5 text-center tabular-nums text-green-600">
                    {b.highLabel}
                  </td>
                  <td className="p-1.5 text-center tabular-nums font-medium">
                    {(b.range * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
