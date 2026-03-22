'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChatStreamEvent } from '@/lib/chat/types';

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

  const submit = async (action: 'approve' | 'reject') => {
    setStatus('submitting');
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

  return (
    <div className="mt-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-200">
        Tool approval required: {toolName}
      </p>
      {args ? (
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl border border-amber-500/20 bg-background/70 p-2 text-[11px] text-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
      {status === 'idle' || status === 'error' ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => submit('approve')}
            className="h-8 rounded-xl"
          >
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => submit('reject')}
            className="h-8 rounded-xl"
          >
            Reject
          </Button>
        </div>
      ) : null}
      {status === 'submitting' ? (
        <p className="mt-2 text-amber-700 dark:text-amber-200">Submitting decision...</p>
      ) : null}
      {status === 'done' ? (
        <p className="mt-2 text-emerald-700 dark:text-emerald-300">Decision submitted.</p>
      ) : null}
      {status === 'error' && errorMessage ? (
        <p className="mt-2 text-destructive">{errorMessage}</p>
      ) : null}
    </div>
  );
}