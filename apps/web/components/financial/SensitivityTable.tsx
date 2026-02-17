"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";
import { computeProForma } from "@/hooks/useProFormaCalculations";
import {
  computeProbabilityWeightedMetrics,
  withStressScenarioBundle,
} from "@/lib/financial/stressTesting";

// ---------------------------------------------------------------------------
// Assumption axis definitions — any numeric field can be an axis
// ---------------------------------------------------------------------------

interface AxisDef {
  key: string;
  label: string;
  path: string[];
  baseGetter: (a: FinancialModelAssumptions) => number;
  setter: (a: FinancialModelAssumptions, v: number) => FinancialModelAssumptions;
  format: (v: number) => string;
  /** Offsets from base to generate column/row headers */
  offsets: number[];
}

function nestedSet(
  a: FinancialModelAssumptions,
  path: string[],
  v: number
): FinancialModelAssumptions {
  if (path.length === 1) {
    return { ...a, [path[0]]: v };
  }
  const [head, ...rest] = path;
  const sub = a[head as keyof FinancialModelAssumptions];
  if (typeof sub === "object" && sub !== null) {
    return { ...a, [head]: { ...sub, [rest[0]]: v } };
  }
  return a;
}

const pctFmt = (v: number) => `${v.toFixed(2)}%`;
const dolFmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const numFmt = (v: number) => v.toLocaleString();

const AXES: AxisDef[] = [
  {
    key: "exitCapRate",
    label: "Exit Cap Rate",
    path: ["exit", "exitCapRate"],
    baseGetter: (a) => a.exit.exitCapRate,
    setter: (a, v) => nestedSet(a, ["exit", "exitCapRate"], v),
    format: (v) => `${v.toFixed(2)}%`,
    offsets: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
  },
  {
    key: "rentGrowthPct",
    label: "Rent Growth",
    path: ["income", "rentGrowthPct"],
    baseGetter: (a) => a.income.rentGrowthPct,
    setter: (a, v) => nestedSet(a, ["income", "rentGrowthPct"], v),
    format: pctFmt,
    offsets: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
  },
  {
    key: "purchasePrice",
    label: "Purchase Price",
    path: ["acquisition", "purchasePrice"],
    baseGetter: (a) => a.acquisition.purchasePrice,
    setter: (a, v) => nestedSet(a, ["acquisition", "purchasePrice"], v),
    format: dolFmt,
    offsets: [-200000, -100000, -50000, 0, 50000, 100000, 200000],
  },
  {
    key: "rentPerSf",
    label: "Rent / SF",
    path: ["income", "rentPerSf"],
    baseGetter: (a) => a.income.rentPerSf,
    setter: (a, v) => nestedSet(a, ["income", "rentPerSf"], v),
    format: (v) => `$${v.toFixed(2)}`,
    offsets: [-2, -1, -0.5, 0, 0.5, 1, 2],
  },
  {
    key: "vacancyPct",
    label: "Vacancy",
    path: ["income", "vacancyPct"],
    baseGetter: (a) => a.income.vacancyPct,
    setter: (a, v) => nestedSet(a, ["income", "vacancyPct"], v),
    format: pctFmt,
    offsets: [-3, -2, -1, 0, 1, 2, 3],
  },
  {
    key: "ltvPct",
    label: "LTV",
    path: ["financing", "ltvPct"],
    baseGetter: (a) => a.financing.ltvPct,
    setter: (a, v) => nestedSet(a, ["financing", "ltvPct"], v),
    format: pctFmt,
    offsets: [-15, -10, -5, 0, 5, 10, 15],
  },
  {
    key: "interestRate",
    label: "Interest Rate",
    path: ["financing", "interestRate"],
    baseGetter: (a) => a.financing.interestRate,
    setter: (a, v) => nestedSet(a, ["financing", "interestRate"], v),
    format: pctFmt,
    offsets: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
  },
  {
    key: "buildableSf",
    label: "Buildable SF",
    path: ["buildableSf"],
    baseGetter: (a) => a.buildableSf,
    setter: (a, v) => nestedSet(a, ["buildableSf"], v),
    format: numFmt,
    offsets: [-5000, -2500, -1000, 0, 1000, 2500, 5000],
  },
];

// ---------------------------------------------------------------------------
// Metric selector
// ---------------------------------------------------------------------------

type MetricKey = "leveredIRR" | "unleveredIRR" | "equityMultiple" | "cashOnCashYear1";

const METRICS: { key: MetricKey; label: string; format: (v: number | null) => string }[] = [
  { key: "leveredIRR", label: "Levered IRR", format: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A" },
  { key: "unleveredIRR", label: "Unlevered IRR", format: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A" },
  { key: "equityMultiple", label: "Equity Multiple", format: (v) => v !== null ? `${v.toFixed(2)}x` : "N/A" },
  { key: "cashOnCashYear1", label: "CoC Y1", format: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A" },
];

// ---------------------------------------------------------------------------
// Color coding for IRR cells
// ---------------------------------------------------------------------------

function cellColor(value: number | null, metric: MetricKey): string {
  if (value === null) return "bg-muted";
  const v = metric === "equityMultiple" ? value : value;
  if (metric === "equityMultiple") {
    if (v >= 2.0) return "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200";
    if (v >= 1.5) return "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200";
    return "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200";
  }
  // IRR or CoC thresholds
  if (v >= 0.15) return "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200";
  if (v >= 0.08) return "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200";
  return "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SensitivityTable({
  assumptions,
}: {
  assumptions: FinancialModelAssumptions;
}) {
  const [colAxisKey, setColAxisKey] = useState("exitCapRate");
  const [rowAxisKey, setRowAxisKey] = useState("rentGrowthPct");
  const [metricKey, setMetricKey] = useState<MetricKey>("leveredIRR");

  const colAxis = AXES.find((a) => a.key === colAxisKey)!;
  const rowAxis = AXES.find((a) => a.key === rowAxisKey)!;
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const grid = useMemo(() => {
    const colBase = colAxis.baseGetter(assumptions);
    const rowBase = rowAxis.baseGetter(assumptions);

    const colValues = colAxis.offsets.map((o) => colBase + o);
    const rowValues = rowAxis.offsets.map((o) => rowBase + o);

    const cells: (number | null)[][] = [];
    for (const rv of rowValues) {
      const row: (number | null)[] = [];
      for (const cv of colValues) {
        let modified = colAxis.setter(assumptions, cv);
        modified = rowAxis.setter(modified, rv);
        const result = computeProForma(modified);
        row.push(result[metricKey]);
      }
      cells.push(row);
    }

    return { colValues, rowValues, cells };
  }, [assumptions, colAxis, rowAxis, metricKey]);

  const colBase = colAxis.baseGetter(assumptions);
  const rowBase = rowAxis.baseGetter(assumptions);
  const stressScenarioBundle = useMemo(
    () => withStressScenarioBundle(assumptions).stressScenarioBundle,
    [assumptions],
  );
  const scenarioResults = useMemo(
    () =>
      (stressScenarioBundle?.scenarios ?? []).map((scenario) => {
        const result = computeProForma(scenario.assumptions);
        return {
          scenario,
          result,
        };
      }),
    [stressScenarioBundle],
  );
  const weighted = useMemo(
    () =>
      computeProbabilityWeightedMetrics(
        scenarioResults.map((entry) => ({
          scenario: entry.scenario,
          metrics: {
            leveredIRR: entry.result.leveredIRR,
            equityMultiple: entry.result.equityMultiple,
          },
        })),
      ),
    [scenarioResults],
  );
  const totalScenarioProbability = useMemo(
    () => scenarioResults.reduce((sum, entry) => sum + entry.scenario.probabilityPct, 0),
    [scenarioResults],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm">Sensitivity Analysis</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={metricKey} onValueChange={(v) => setMetricKey(v as MetricKey)}>
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Rows:</span>
          <Select value={rowAxisKey} onValueChange={setRowAxisKey}>
            <SelectTrigger className="h-7 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AXES.filter((a) => a.key !== colAxisKey).map((a) => (
                <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>Columns:</span>
          <Select value={colAxisKey} onValueChange={setColAxisKey}>
            <SelectTrigger className="h-7 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AXES.filter((a) => a.key !== rowAxisKey).map((a) => (
                <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-1.5 text-left font-medium text-muted-foreground border-b">
                {rowAxis.label} \ {colAxis.label}
              </th>
              {grid.colValues.map((cv, ci) => (
                <th
                  key={ci}
                  className={`p-1.5 text-center font-medium border-b tabular-nums ${
                    cv === colBase ? "bg-muted/50 font-bold" : ""
                  }`}
                >
                  {colAxis.format(cv)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rowValues.map((rv, ri) => (
              <tr key={ri}>
                <td
                  className={`p-1.5 font-medium border-r tabular-nums ${
                    rv === rowBase ? "bg-muted/50 font-bold" : ""
                  }`}
                >
                  {rowAxis.format(rv)}
                </td>
                {grid.cells[ri].map((cellVal, ci) => {
                  const isBase = rv === rowBase && grid.colValues[ci] === colBase;
                  return (
                    <td
                      key={ci}
                      className={`p-1.5 text-center tabular-nums ${cellColor(cellVal, metricKey)} ${
                        isBase ? "ring-2 ring-primary ring-inset font-bold" : ""
                      }`}
                    >
                      {metric.format(cellVal)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 rounded-md border">
          <div className="border-b px-2 py-1.5 text-xs font-medium">Stress Scenario Bundle</div>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                  Scenario
                </th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                  Probability
                </th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                  Levered IRR
                </th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                  Equity Multiple
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarioResults.map(({ scenario, result }) => (
                <tr key={scenario.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{scenario.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {scenario.probabilityPct.toFixed(1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {result.leveredIRR !== null ? `${(result.leveredIRR * 100).toFixed(2)}%` : "N/A"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {result.equityMultiple.toFixed(2)}x
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40">
                <td className="px-2 py-1.5 font-medium">Probability-Weighted Expected</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">
                  {totalScenarioProbability.toFixed(1)}%
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {weighted.expectedLeveredIRR !== null
                    ? `${(weighted.expectedLeveredIRR * 100).toFixed(2)}%`
                    : "N/A"}
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {weighted.expectedEquityMultiple !== null
                    ? `${weighted.expectedEquityMultiple.toFixed(2)}x`
                    : "N/A"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
