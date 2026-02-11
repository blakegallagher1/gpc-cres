"use client";

import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Minus,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AssumptionBias {
  assumptionName: string;
  avgProjected: number;
  avgActual: number;
  avgVariancePct: number;
  sampleSize: number;
  direction: "over" | "under" | "neutral";
}

interface TriageCalibration {
  triageTier: string;
  totalDeals: number;
  exitedDeals: number;
  killedDeals: number;
  avgActualIrr: number | null;
  avgActualEquityMultiple: number | null;
  successRate: number;
}

interface OutcomeSummary {
  totalExited: number;
  totalKilled: number;
  avgIrr: number | null;
  avgEquityMultiple: number | null;
  avgHoldMonths: number | null;
  topBiases: AssumptionBias[];
  triageCalibration: TriageCalibration[];
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OutcomesPage() {
  const { data } = useSWR<OutcomeSummary>(
    "/api/outcomes?view=summary",
    fetcher,
    { refreshInterval: 60_000 }
  );

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading outcome data...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Outcome Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Compare projected vs. actual performance, detect systematic biases,
          and calibrate triage scoring
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Exited Deals"
          value={String(data.totalExited)}
          icon={CheckCircle2}
        />
        <StatCard
          label="Killed Deals"
          value={String(data.totalKilled)}
          icon={XCircle}
        />
        <StatCard
          label="Avg IRR"
          value={data.avgIrr != null ? `${data.avgIrr.toFixed(1)}%` : "—"}
          icon={TrendingUp}
        />
        <StatCard
          label="Avg Equity Multiple"
          value={
            data.avgEquityMultiple != null
              ? `${data.avgEquityMultiple.toFixed(2)}x`
              : "—"
          }
          icon={BarChart3}
        />
        <StatCard
          label="Avg Hold Period"
          value={
            data.avgHoldMonths != null ? `${data.avgHoldMonths} mo` : "—"
          }
          icon={Clock}
        />
      </div>

      {/* Assumption Biases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assumption Bias Detection</CardTitle>
          <CardDescription>
            Systematic differences between projected and actual values across
            exited deals. Minimum 2 data points required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.topBiases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bias data yet. Record actual outcomes on exited deals to start
              tracking biases.
            </p>
          ) : (
            <div className="space-y-3">
              {data.topBiases.map((b) => (
                <div
                  key={b.assumptionName}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {b.assumptionName}
                      </p>
                      <Badge
                        variant={
                          b.direction === "neutral"
                            ? "outline"
                            : b.direction === "over"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {b.direction === "over" && (
                          <TrendingUp className="mr-1 h-3 w-3" />
                        )}
                        {b.direction === "under" && (
                          <TrendingDown className="mr-1 h-3 w-3" />
                        )}
                        {b.direction === "neutral" && (
                          <Minus className="mr-1 h-3 w-3" />
                        )}
                        {b.direction === "over"
                          ? "Overestimate"
                          : b.direction === "under"
                            ? "Underestimate"
                            : "On target"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Projected avg: {b.avgProjected.toLocaleString()} |
                      Actual avg: {b.avgActual.toLocaleString()} | n=
                      {b.sampleSize}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-lg font-bold ${
                        Math.abs(b.avgVariancePct) > 10
                          ? "text-red-500"
                          : Math.abs(b.avgVariancePct) > 5
                            ? "text-amber-500"
                            : "text-green-500"
                      }`}
                    >
                      {b.avgVariancePct > 0 ? "+" : ""}
                      {b.avgVariancePct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Triage Calibration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Triage Calibration</CardTitle>
          <CardDescription>
            How well do triage tier recommendations predict actual deal outcomes?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.triageCalibration.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calibration data yet. Triage deals and track their outcomes to
              see calibration.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Tier</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Total
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Exited
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Killed
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Success Rate
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Avg IRR
                    </th>
                    <th className="pb-2 font-medium text-right">
                      Avg EM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.triageCalibration.map((c) => (
                    <tr key={c.triageTier} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            c.triageTier === "ADVANCE" || c.triageTier === "A"
                              ? "default"
                              : c.triageTier === "HOLD" || c.triageTier === "B"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          <Target className="mr-1 h-3 w-3" />
                          {c.triageTier}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {c.totalDeals}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {c.exitedDeals}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {c.killedDeals}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">
                        {c.successRate}%
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {c.avgActualIrr != null
                          ? `${c.avgActualIrr.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {c.avgActualEquityMultiple != null
                          ? `${c.avgActualEquityMultiple.toFixed(2)}x`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
