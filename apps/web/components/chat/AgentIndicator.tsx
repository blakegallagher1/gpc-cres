'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const agentColors: Record<string, string> = {
  coordinator: 'bg-slate-500',
  legal: 'bg-amber-500',
  research: 'bg-blue-500',
  risk: 'bg-red-500',
  finance: 'bg-emerald-500',
  screener: 'bg-purple-500',
  'deal-screener': 'bg-purple-500',
  'due-diligence': 'bg-cyan-500',
  entitlements: 'bg-orange-500',
  'market-intel': 'bg-indigo-500',
  'tax-strategist': 'bg-teal-500',
  design: 'bg-pink-500',
  operations: 'bg-yellow-500',
  marketing: 'bg-rose-500',
};

const agentBorderColors: Record<string, string> = {
  coordinator: 'border-l-slate-500',
  legal: 'border-l-amber-500',
  research: 'border-l-blue-500',
  risk: 'border-l-red-500',
  finance: 'border-l-emerald-500',
  screener: 'border-l-purple-500',
  'deal-screener': 'border-l-purple-500',
  'due-diligence': 'border-l-cyan-500',
  entitlements: 'border-l-orange-500',
  'market-intel': 'border-l-indigo-500',
  'tax-strategist': 'border-l-teal-500',
  design: 'border-l-pink-500',
  operations: 'border-l-yellow-500',
  marketing: 'border-l-rose-500',
};

function normalizeAgentKey(agentName: string): string {
  return agentName.toLowerCase().replace(/\s+agent$/i, '').replace(/\s+/g, '-');
}

function getAgentColor(agentName: string): string {
  return agentColors[normalizeAgentKey(agentName)] ?? 'bg-slate-500';
}

function getAgentBorderColor(agentName: string): string {
  return agentBorderColors[normalizeAgentKey(agentName)] ?? 'border-l-slate-600';
}

function formatAgentLabel(agentName: string): string {
  return agentName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface AgentIndicatorProps {
  agentName: string;
}

export function AgentIndicator({ agentName }: AgentIndicatorProps) {
  const color = getAgentColor(agentName);
  const label = formatAgentLabel(agentName);

  return (
    <div className="border-b border-border/60 px-4 py-3 sm:px-6">
      <Card className="app-shell-panel border-border/60 bg-transparent">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full animate-pulse', color)} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Active Handoff
                </p>
                <Badge variant="outline" className="border-border/70 bg-background/55 text-[9px]">
                  {label}
                </Badge>
              </div>
              <p className="truncate text-sm font-medium text-foreground">
                {label} is executing the current step.
              </p>
            </div>
          </div>
          <p className="hidden text-xs text-muted-foreground xl:block">
            Watch tools and verification in the inspector.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export { agentColors, agentBorderColors, getAgentColor, getAgentBorderColor, formatAgentLabel };
