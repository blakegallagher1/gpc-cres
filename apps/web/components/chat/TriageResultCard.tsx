'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type Decision = 'ADVANCE' | 'HOLD' | 'KILL';

const decisionStyles: Record<Decision, { bg: string; text: string; ring: string }> = {
  ADVANCE: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
  HOLD: { bg: 'bg-amber-500/15', text: 'text-amber-400', ring: 'ring-amber-500/30' },
  KILL: { bg: 'bg-red-500/15', text: 'text-red-400', ring: 'ring-red-500/30' },
};

const scoreColor = (score: number): string => {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
};

const barColor = (score: number): string => {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

interface CategoryBreakdown {
  name: string;
  score: number;
  maxScore: number;
}

interface TriageResultCardProps {
  decision: Decision;
  score: number;
  categories?: CategoryBreakdown[];
  disqualifiers?: string[];
}

export function TriageResultCard({
  decision,
  score,
  categories,
  disqualifiers,
}: TriageResultCardProps) {
  const style = decisionStyles[decision];

  return (
    <Card className="my-3 border-border/70 bg-background/75">
      <CardHeader className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-4">
          <Badge
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-bold tracking-[0.18em]',
              style.bg,
              style.text,
              style.ring
            )}
          >
            {decision}
          </Badge>

          <div className="flex items-center gap-2">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-border/70"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${(score / 100) * 125.66} 125.66`}
                  strokeLinecap="round"
                  className={scoreColor(score)}
                />
              </svg>
              <span className={cn('absolute font-mono text-sm font-bold', scoreColor(score))}>
                {score}
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      </CardHeader>

      {(categories && categories.length > 0) || (disqualifiers && disqualifiers.length > 0) ? (
        <>
          <Separator />
          <CardContent className="flex flex-col gap-4 p-4">
            {categories && categories.length > 0 ? (
              <div className="flex flex-col gap-2">
                {categories.map((cat) => {
                  const pct = Math.round((cat.score / cat.maxScore) * 100);
                  return (
                    <div key={cat.name} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{cat.name}</span>
                        <span className="font-mono font-medium text-foreground">
                          {cat.score}/{cat.maxScore}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/60">
                        <div
                          className={cn('h-1.5 rounded-full transition-all', barColor(pct))}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {disqualifiers && disqualifiers.length > 0 ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/8 p-3">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-destructive">
                  Disqualifiers
                </p>
                <ul className="flex flex-col gap-1 text-xs text-destructive/85">
                  {disqualifiers.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </>
      ) : null}
    </Card>
  );
}
