'use client';

import { Bot, GitBranch } from 'lucide-react';

import { StatusBadge } from './StatusBadge';

interface AgentStatusChipProps {
  agentName: string;
  mode?: 'active' | 'handoff';
}

export function AgentStatusChip({ agentName, mode = 'active' }: AgentStatusChipProps) {
  return (
    <StatusBadge
      label={agentName}
      tone={mode === 'handoff' ? 'indigo' : 'amber'}
      icon={mode === 'handoff' ? GitBranch : Bot}
    />
  );
}
