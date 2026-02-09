'use client';

import { cn } from '@/lib/utils';

type Decision = 'ADVANCE' | 'HOLD' | 'KILL';

const decisionStyles: Record<Decision, { bg: string; text: string; ring: string }> = {
  ADVANCE: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30' },
  HOLD: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/30' },
  KILL: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-500/30' },
};

const scoreColor = (score: number): string => {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
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
    <div className="my-3 rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset',
            style.bg,
            style.text,
            style.ring
          )}
        >
          {decision}
        </div>

        {/* Score circle */}
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
                className="text-muted/50"
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
            <span className={cn('absolute text-sm font-bold', scoreColor(score))}>
              {score}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="mt-4 space-y-2">
          {categories.map((cat) => {
            const pct = Math.round((cat.score / cat.maxScore) * 100);
            return (
              <div key={cat.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{cat.name}</span>
                  <span className="font-medium">
                    {cat.score}/{cat.maxScore}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={cn('h-1.5 rounded-full transition-all', barColor(pct))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Disqualifiers */}
      {disqualifiers && disqualifiers.length > 0 && (
        <div className="mt-3 rounded-md bg-red-500/5 p-2">
          <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
            Disqualifiers
          </p>
          <ul className="space-y-0.5">
            {disqualifiers.map((d, i) => (
              <li key={i} className="text-xs text-red-600/80 dark:text-red-400/80">
                - {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
