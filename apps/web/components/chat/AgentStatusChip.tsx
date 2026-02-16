'use client';

import { Bot, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStatusChipProps {
  agentName: string;
  mode?: 'active' | 'handoff';
}

export function AgentStatusChip({ agentName, mode = 'active' }: AgentStatusChipProps) {
  const Icon = mode === 'handoff' ? GitBranch : Bot;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        mode === 'handoff'
          ? 'border-indigo-200 bg-indigo-100 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-100'
          : 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100',
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{agentName}</span>
    </div>
  );
}
