'use client';

import { useState } from 'react';
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
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-100/70 p-2 text-xs dark:border-amber-700 dark:bg-amber-900/20">
      <p className="font-medium text-amber-900 dark:text-amber-100">
        Tool approval required: {toolName}
      </p>
      {args ? (
        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-white/60 p-2 text-[11px] text-amber-950 dark:bg-black/20 dark:text-amber-100">
          {JSON.stringify(args, null, 2)}
        </pre>
      ) : null}
      {status === 'idle' || status === 'error' ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit('approve')}
            className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => submit('reject')}
            className="rounded bg-rose-600 px-2 py-1 text-white hover:bg-rose-700"
          >
            Reject
          </button>
        </div>
      ) : null}
      {status === 'submitting' ? (
        <p className="mt-2 text-amber-800 dark:text-amber-200">Submitting decision...</p>
      ) : null}
      {status === 'done' ? (
        <p className="mt-2 text-emerald-700 dark:text-emerald-300">Decision submitted.</p>
      ) : null}
      {status === 'error' && errorMessage ? (
        <p className="mt-2 text-rose-700 dark:text-rose-300">{errorMessage}</p>
      ) : null}
    </div>
  );
}
