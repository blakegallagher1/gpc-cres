'use client';

import { CheckCircle2, Loader2, Wrench } from 'lucide-react';

import { StatusBadge } from './StatusBadge';

interface ToolStatusChipProps {
  toolName: string;
  status: 'running' | 'completed';
}

export function ToolStatusChip({ toolName, status }: ToolStatusChipProps) {
  return (
    <StatusBadge
      label={toolName}
      tone={status === 'running' ? 'blue' : 'emerald'}
      icon={status === 'running' ? Loader2 : CheckCircle2}
      iconClassName={status === 'running' ? 'animate-spin' : undefined}
    />
  );
}
