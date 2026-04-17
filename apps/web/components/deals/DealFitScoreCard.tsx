"use client";

import useSWR from "swr";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FitScoreGap {
  dimension: string;
  severity: "hard_fail" | "soft_miss" | "ok";
  observed: string | number | null;
  expected: string;
  reason: string;
}

interface FitScoreResult {
  score: number;
  verdict: "fit" | "borderline" | "miss" | "insufficient_data";
  hardFailures: FitScoreGap[];
  softMisses: FitScoreGap[];
  passes: FitScoreGap[];
  evaluatedAt: string;
}

interface DealFitScoreCardProps {
  dealId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const VERDICT_META: Record<
  FitScoreResult["verdict"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  fit: {
    label: "FIT",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    icon: CheckCircle2,
  },
  borderline: {
    label: "BORDERLINE",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    icon: AlertTriangle,
  },
  miss: {
    label: "MISS",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: XCircle,
  },
  insufficient_data: {
    label: "NEEDS DATA",
    className: "bg-muted text-muted-foreground border-border",
    icon: HelpCircle,
  },
};

export function DealFitScoreCard({ dealId }: DealFitScoreCardProps) {
  const { data, error, isLoading } = useSWR<{ fitScore: FitScoreResult }>(
    `/api/deals/${dealId}/fit-score`,
    fetcher,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Computing fit score…
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return null;
  }

  const result = data.fitScore;
  const meta = VERDICT_META[result.verdict];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm tracking-wide uppercase">
          <span>Investment fit</span>
          <Badge variant="outline" className={meta.className}>
            <Icon className="mr-1 h-3 w-3" />
            {meta.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{result.score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>

        {result.hardFailures.length > 0 && (
          <div>
            <p className="text-xs font-medium text-destructive">Hard gate failures</p>
            <ul className="mt-1 space-y-1 text-xs">
              {result.hardFailures.map((gap) => (
                <li key={gap.dimension} className="flex items-start gap-1">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  <span>
                    <strong>{gap.dimension}</strong>: {gap.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.softMisses.length > 0 && (
          <div>
            <p className="text-xs font-medium text-amber-500">Soft misses</p>
            <ul className="mt-1 space-y-1 text-xs">
              {result.softMisses.map((gap) => (
                <li key={gap.dimension} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span>
                    <strong>{gap.dimension}</strong> ({gap.observed ?? "—"}): {gap.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.hardFailures.length === 0 && result.softMisses.length === 0 && (
          <p className="text-xs text-emerald-500">
            All gates pass and preferences match default investment criteria.
          </p>
        )}

        <p className="text-[10px] text-muted-foreground">
          Evaluated {new Date(result.evaluatedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default DealFitScoreCard;
