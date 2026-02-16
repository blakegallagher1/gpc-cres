'use client';

import { CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolStatusChipProps {
  toolName: string;
  status: 'running' | 'completed';
}

export function ToolStatusChip({ toolName, status }: ToolStatusChipProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        status === 'running'
          ? 'border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-100'
          : 'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100',
      )}
    >
      {status === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : status === 'completed' ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Wrench className="h-3 w-3" />
      )}
      <span>{toolName}</span>
    </div>
  );
}
