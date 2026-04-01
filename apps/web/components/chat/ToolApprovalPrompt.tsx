'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatStreamEvent } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

interface ToolApprovalPromptProps {
  runId: string;
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  onEvents?: (events: ChatStreamEvent[]) => void;
}

export function ToolApprovalPrompt({
  runId,
  toolCallId,
  toolName,
  args,
  onEvents,
}: ToolApprovalPromptProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'approve' | 'reject' | null>(null);

  const submit = async (action: 'approve' | 'reject') => {
    setStatus('submitting');
    setLastAction(action);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/chat/tool-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          toolCallId,
          action,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        events?: ChatStreamEvent[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Approval request failed (${response.status})`);
      }
      onEvents?.(Array.isArray(payload.events) ? payload.events : []);
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit approval');
    }
  };

  const summaryTone =
    status === 'done'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'error'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200';

  return (
    <div className={cn('mt-3 overflow-hidden rounded-2xl border p-3 text-xs shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]', summaryTone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-current/15 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
              {status === 'done' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : status === 'error' ? (
                <XCircle className="h-3 w-3" />
              ) : status === 'submitting' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {status === 'done'
                ? 'Decision recorded'
                : status === 'error'
                  ? 'Approval failed'
                  : status === 'submitting'
                    ? 'Submitting decision'
                    : 'Approval required'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-current/15 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
              <ShieldCheck className="h-3 w-3" />
              {toolName}
            </span>
          </div>
          <p className="text-sm font-medium">
            {status === 'done'
              ? `${lastAction === 'reject' ? 'Rejected' : 'Approved'} ${toolName}.`
              : `Review ${toolName} before the run continues.`}
          </p>
          <p className="max-w-2xl text-[11px] leading-5 text-current/80">
            Operator approval pauses the workflow so you can confirm the tool call, inspect the inputs, and keep the run auditable.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-current/15 bg-background/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]">
          <Clock3 className="h-3 w-3" />
          {status === 'submitting' ? 'Processing' : status === 'done' ? 'Resolved' : 'Pending'}
        </div>
      </div>

      {args ? (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-current/15 bg-background/72 p-3 text-[11px] text-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
      {status === 'idle' || status === 'error' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => submit('approve')}
            className="h-9 rounded-xl px-4"
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => submit('reject')}
            className="h-9 rounded-xl px-4"
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      ) : null}
      {status === 'submitting' ? (
        <p className="mt-3 text-[11px] text-current/80">Submitting decision...</p>
      ) : null}
      {status === 'done' ? (
        <p className="mt-3 text-[11px] text-current/80">
          Decision submitted. The transcript will resume as soon as the run emits the next event.
        </p>
      ) : null}
      {status === 'error' && errorMessage ? (
        <p className="mt-3 text-[11px] text-current">{errorMessage}</p>
      ) : null}
    </div>
  );
}
