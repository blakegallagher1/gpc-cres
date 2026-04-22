"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GeneralizedScore = {
  id: string;
  module: string;
  dimension: string;
  score: number;
  weight: number | null;
  evidence: string | null;
  scoredAt: string;
};

type GeneralizedScorecardProps = {
  scores: GeneralizedScore[];
};

type ModuleGroup = {
  module: string;
  overallScore: number;
  latestScoredAt: string;
  items: GeneralizedScore[];
};

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function formatScore(score: number): string {
  return score <= 1 ? `${Math.round(score * 100)}%` : score.toFixed(1);
}

function formatScoredDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleDateString();
}

function groupScores(scores: GeneralizedScore[]): ModuleGroup[] {
  const groups = new Map<string, GeneralizedScore[]>();

  for (const score of scores) {
    const existing = groups.get(score.module) ?? [];
    existing.push(score);
    groups.set(score.module, existing);
  }

  return [...groups.entries()]
    .map(([module, items]) => {
      const totalWeight = items.reduce(
        (sum, item) => sum + (item.weight ?? 1),
        0,
      );
      const weightedScore = items.reduce(
        (sum, item) => sum + item.score * (item.weight ?? 1),
        0,
      );
      const latestScoredAt = [...items]
        .sort((left, right) => right.scoredAt.localeCompare(left.scoredAt))[0]?.scoredAt ?? "";

      return {
        module,
        overallScore: totalWeight > 0 ? weightedScore / totalWeight : 0,
        latestScoredAt,
        items: items.sort((left, right) => left.dimension.localeCompare(right.dimension)),
      };
    })
    .sort((left, right) => right.overallScore - left.overallScore);
}

export function GeneralizedScorecard({ scores }: GeneralizedScorecardProps) {
  if (scores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No generalized scores have been captured for this deal yet.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groupScores(scores).map((group) => (
        <Card key={group.module} className="border-border bg-muted">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{formatLabel(group.module)}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last scored {formatScoredDate(group.latestScoredAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Module Score
                </p>
                <p className="text-2xl font-semibold">{formatScore(group.overallScore)}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{formatLabel(item.dimension)}</p>
                    {item.weight !== null ? (
                      <p className="text-xs text-muted-foreground">
                        Weight {item.weight.toFixed(2)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold">{formatScore(item.score)}</p>
                </div>
                {item.evidence ? (
                  <p className="mt-2 text-sm text-muted-foreground">{item.evidence}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
