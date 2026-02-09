'use client';

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

function getAgentColor(agentName: string): string {
  const key = agentName.toLowerCase().replace(/\s+agent$/i, '').replace(/\s+/g, '-');
  return agentColors[key] ?? 'bg-slate-500';
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
    <div className="flex items-center gap-2 border-b px-6 py-2">
      <span className={cn('h-2 w-2 rounded-full animate-pulse', color)} />
      <span className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span> is analyzing...
      </span>
    </div>
  );
}

export { agentColors, getAgentColor, formatAgentLabel };
