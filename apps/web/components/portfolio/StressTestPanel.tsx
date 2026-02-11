"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, AlertTriangle, Zap } from "lucide-react";
import type { PortfolioStressTestResult } from "@/lib/services/portfolioAnalytics.service";

const PRESET_SCENARIOS = [
  {
    name: "Rate Shock (+200bp)",
    rateShockBps: 200,
    capRateExpansionBps: 50,
  },
  {
    name: "Recession",
    vacancySpikePct: 10,
    rentDeclinePct: 10,
    capRateExpansionBps: 100,
  },
  {
    name: "Stagflation",
    rateShockBps: 300,
    vacancySpikePct: 5,
    capRateExpansionBps: 75,
  },
  {
    name: "Mild Downturn",
    rateShockBps: 100,
    vacancySpikePct: 3,
    rentDeclinePct: 5,
  },
];

export function StressTestPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PortfolioStressTestResult | null>(null);
  const [activeScenario, setActiveScenario] = useState<string>("");

  const runScenario = async (scenario: (typeof PRESET_SCENARIOS)[number]) => {
    setLoading(true);
    setActiveScenario(scenario.name);
    try {
      const res = await fetch("/api/portfolio/stress-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) throw new Error("Failed");
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4" />
          Portfolio Stress Test
        </CardTitle>
        <CardDescription className="text-xs">
          Test portfolio resilience against economic scenarios
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESET_SCENARIOS.map((s) => (
            <Button
              key={s.name}
              size="sm"
              variant={activeScenario === s.name ? "default" : "outline"}
              disabled={loading}
              onClick={() => runScenario(s)}
              className="h-7 text-[11px]"
            >
              {loading && activeScenario === s.name ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              {s.name}
            </Button>
          ))}
        </div>

        {result && (
          <>
            <div className="grid grid-cols-4 gap-3 rounded-lg bg-muted p-3 text-xs">
              <div>
                <span className="text-muted-foreground">Base IRR:</span>{" "}
                <span className="font-semibold">
                  {result.portfolioBaseIRR !== null
                    ? `${result.portfolioBaseIRR.toFixed(1)}%`
                    : "--"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Stressed IRR:</span>{" "}
                <span className="font-semibold text-amber-600">
                  {result.portfolioStressedIRR !== null
                    ? `${result.portfolioStressedIRR.toFixed(1)}%`
                    : "--"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">At Risk:</span>{" "}
                <span className="font-semibold text-red-600">
                  {result.dealsAtRisk} / {result.totalDeals}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Scenario:</span>{" "}
                <span className="font-semibold">{result.scenario.name}</span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Deal</TableHead>
                    <TableHead className="text-right text-xs">
                      Base IRR
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      Stressed
                    </TableHead>
                    <TableHead className="text-right text-xs">DSCR</TableHead>
                    <TableHead className="text-right text-xs">EM</TableHead>
                    <TableHead className="text-center text-xs">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results.map((r) => (
                    <TableRow
                      key={r.dealId}
                      className={r.atRisk ? "bg-red-50/50" : ""}
                    >
                      <TableCell className="text-xs font-medium">
                        {r.dealName}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.baseIRR !== null ? `${r.baseIRR.toFixed(1)}%` : "--"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.stressedIRR !== null
                          ? `${r.stressedIRR.toFixed(1)}%`
                          : "--"}
                        {r.irrChange !== null && (
                          <span
                            className={`ml-1 text-[10px] ${
                              r.irrChange < 0 ? "text-red-500" : "text-emerald-500"
                            }`}
                          >
                            ({r.irrChange > 0 ? "+" : ""}
                            {r.irrChange.toFixed(1)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        <span
                          className={
                            r.stressedDSCR < 1.0
                              ? "text-red-600 font-semibold"
                              : r.stressedDSCR < 1.25
                              ? "text-amber-600"
                              : ""
                          }
                        >
                          {r.stressedDSCR.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.stressedEquityMultiple.toFixed(2)}x
                      </TableCell>
                      <TableCell className="text-center">
                        {r.atRisk ? (
                          <Badge
                            variant="destructive"
                            className="gap-0.5 text-[9px]"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            At Risk
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-emerald-600"
                          >
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
