'use client';

import type { ComponentType } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ClipboardCopy,
  ClipboardList,
  ExternalLink,
  FileText,
  GitBranch,
  RefreshCcw,
  Wrench,
  Rocket,
  Link as LinkIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAgentColor, formatAgentLabel } from './AgentIndicator';
import { ToolCallCard } from './ToolCallCard';
import { TriageResultCard } from './TriageResultCard';
import { ArtifactDownloadCard } from './ArtifactDownloadCard';
import { AgentStatusChip } from './AgentStatusChip';
import { ToolStatusChip } from './ToolStatusChip';
import { ToolApprovalPrompt } from './ToolApprovalPrompt';
import type { ChatMessage, ChatStreamEvent } from '@/lib/chat/types';

type MessageBubbleEventMap = Record<string, ComponentType<{ className?: string }>>;

const eventIcons: MessageBubbleEventMap = {
  agent_progress: Rocket,
  agent_switch: RefreshCcw,
  agent_summary: ExternalLink,
  handoff: GitBranch,
  tool_start: Wrench,
  tool_end: FileText,
  tool_approval: AlertTriangle,
};

interface MessageBubbleProps {
  message: ChatMessage;
  conversationId?: string | null;
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void;
}

function ToolResultCard({ name, result }: { name: string; result: unknown }) {
  return (
    <div className="my-2 rounded-lg border bg-background/90 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span>{name}</span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2">
        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

export type { ChatMessage } from '@/lib/chat/types';

function formatDateDisplay(value: string): string {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function findSourceUrl(message: ChatMessage): string | null {
  const candidates = [
    typeof message.content === 'string' ? message.content : '',
    ...(Array.isArray(message.toolCalls) ? message.toolCalls.map((tool) => {
      const result = typeof tool.result === 'string'
        ? tool.result
        : JSON.stringify(tool.result ?? '');
      return result;
    }) : []),
    JSON.stringify(message.metadata ?? {}),
  ];

  const urlRegex = /(https?:\/\/[\w.-]+(?:\:[0-9]+)?(?:\/[^\s"']*)?)/i;

  for (const candidate of candidates) {
    const match = candidate.match(urlRegex);
    if (match) {
      return match[1];
    }
  }

  const toolSource =
    Array.isArray(message.toolCalls) ?
      message.toolCalls
        .map((tool) => (typeof tool.args?.sourceUrl === 'string' ? tool.args.sourceUrl : ''))
        .find((value) => value.length > 0)
      : null;

  return typeof toolSource === 'string' && toolSource.length > 0
    ? toolSource
    : null;
}

function EventHeader({
  title,
  agentName,
  rightAction,
}: {
  title: string;
  agentName?: string;
  rightAction?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground">{title}</span>
        {agentName ? ` · ${agentName}` : ''}
      </span>
      {rightAction}
    </div>
  );
}

function MessageActions({
  conversationId,
  messageId,
  message,
}: {
  conversationId?: string | null;
  messageId: string;
  message: ChatMessage;
}) {
  const shareHref =
    typeof window === 'undefined'
      ? null
      : (() => {
          const base = new URL(window.location.href);
          if (conversationId) {
            base.searchParams.set('conversationId', conversationId);
          }
          if (messageId) {
            base.hash = `m-${messageId}`;
          }
          return base.toString();
        })();

  const sourceUrl = findSourceUrl(message);

  const onCopy = async () => {
    if (!navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(message.content);
  };

  const onCopyLink = async () => {
    if (!shareHref || !navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(shareHref);
  };

  const onReopen = () => {
    if (typeof window === 'undefined' || !conversationId) return;
    const target = new URL(window.location.href);
    target.searchParams.set('conversationId', conversationId);
    window.history.replaceState({}, '', target.toString());
    window.dispatchEvent(new Event('chat:reopen-conversation'));
  };

  const onOpenSource = () => {
    if (!sourceUrl) return;
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const hasSource = Boolean(sourceUrl);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted"
      >
        <ClipboardCopy className="h-3 w-3" />
        Copy
      </button>

      {conversationId ? (
        <button
          type="button"
          onClick={onReopen}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          <RefreshCcw className="h-3 w-3" />
          Reopen
        </button>
      ) : null}

      {shareHref ? (
        <button
          type="button"
          onClick={onCopyLink}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          <LinkIcon className="h-3 w-3" />
          Share link
        </button>
      ) : null}

      {hasSource ? (
        <button
          type="button"
          onClick={onOpenSource}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3 w-3" />
          Open source
        </button>
      ) : null}
    </div>
  );
}

function renderSystemContent(
  message: ChatMessage,
  conversationId?: string | null,
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void,
) {
  const eventKind = message.eventKind;
  const Icon = eventKind ? eventIcons[eventKind] : null;

  if (!eventKind) return null;

  if (eventKind === 'agent_progress' && message.agentName) {
    return (
      <div className="rounded-lg border bg-indigo-50 p-3 text-sm text-indigo-950 dark:bg-indigo-950/20 dark:text-indigo-100">
        <EventHeader
          title="Agent Progress"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <p className="text-xs text-muted-foreground">{message.content}</p>
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">Tools in-flight</p>
            {message.toolCalls.map((toolCall, i) => (
              <p
                key={`${message.id}-progress-tool-${i}`}
                className="text-xs text-indigo-900 dark:text-indigo-100"
              >
                {toolCall.name}
              </p>
            ))}
          </div>
        )}
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'agent_switch' && message.agentName) {
    return (
      <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        <EventHeader
          title="Agent Switched"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={message.agentName} mode="active" />
          <span>Active agent changed.</span>
        </div>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'handoff') {
    const handoffTarget = message.agentName ?? 'Specialist';
    return (
      <div className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm text-indigo-950 dark:bg-indigo-950/20 dark:text-indigo-100">
        <EventHeader
          title="Agent Handoff"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={handoffTarget} mode="handoff" />
          <span>{message.content}</span>
        </div>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'tool_start' || eventKind === 'tool_end') {
    const toolName = message.toolCalls?.[0]?.name ?? message.agentName ?? 'tool';
    const status = eventKind === 'tool_start' ? 'running' : 'completed';
    return (
      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:bg-slate-900/30 dark:text-slate-100">
        <EventHeader
          title={eventKind === 'tool_start' ? 'Tool Started' : 'Tool Completed'}
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <ToolStatusChip toolName={toolName} status={status} />
          <span>{message.content}</span>
        </div>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'tool_approval') {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const runId = typeof metadata.runId === 'string' ? metadata.runId : null;
    const toolCallId = typeof metadata.toolCallId === 'string' ? metadata.toolCallId : null;
    const toolName =
      message.toolCalls?.[0]?.name ??
      (typeof metadata.toolName === 'string' ? metadata.toolName : null) ??
      'tool';
    const args = message.toolCalls?.[0]?.args;

    return (
      <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
        <EventHeader
          title="Tool Approval Required"
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <p className="text-xs">{message.content}</p>
        {runId && toolCallId ? (
          <ToolApprovalPrompt
            runId={runId}
            toolCallId={toolCallId}
            toolName={toolName}
            args={args}
            onEvents={onToolApprovalEvents}
          />
        ) : null}
      </div>
    );
  }

  if (eventKind === 'agent_summary') {
    const confidence = message.trust?.confidence;
    const completion = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'N/A';
    const agent = message.trust?.lastAgentName ?? message.agentName ?? 'Coordinator';

    return (
      <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100">
        <EventHeader
          title="Agent Summary"
          agentName={agent}
          rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined}
        />
        <div className="grid gap-1 text-xs sm:grid-cols-2">
          <p>
            Confidence: <strong>{completion}</strong>
          </p>
          <p>
            Evidence gaps: <strong>{message.trust?.missingEvidence?.length ?? 0}</strong>
          </p>
          <p>
            Tools: <strong>{message.trust?.toolsInvoked?.length ?? 0}</strong>
          </p>
          <p>
            Duration: <strong>{message.trust?.durationMs ?? 'n/a'} ms</strong>
          </p>
        </div>
        {message.trust?.errorSummary ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
            {message.trust.errorSummary}
          </p>
        ) : null}
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'error') {
    return (
      <div className="rounded-lg border bg-rose-50 px-3 py-2 text-sm text-rose-950 dark:bg-rose-950/20 dark:text-rose-100">
        <EventHeader title="Agent Error" rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined} />
        <p className="text-xs">{message.content}</p>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'tool_result') {
    return (
      <div className="rounded-lg border bg-violet-50 p-3 text-sm text-violet-950 dark:bg-violet-950/20 dark:text-violet-100">
        <EventHeader title="Tool Result" rightAction={Icon ? <Icon className="h-3 w-3" /> : undefined} />
        <ToolResultCard
          name={message.agentName ?? 'tool'}
          result={message.content.length > 0 ? message.content : 'No result available'}
        />
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  return null;
}

export function MessageBubble({
  message,
  conversationId,
  onToolApprovalEvents,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystemEvent = message.eventKind !== undefined && message.eventKind !== 'assistant';
  const hasEvent = message.eventKind !== undefined;
  const systemContent = renderSystemContent(message, conversationId, onToolApprovalEvents);

  return (
    <div className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700">
          <span className="text-xs font-semibold text-white">G</span>
        </div>
      ) : (
        <ClipboardList className="mt-2 h-7 w-7 shrink-0 text-muted-foreground" />
      )}

      <div className={cn('max-w-[82%] space-y-1', isUser && 'items-end')}>
        {!isSystemEvent && !isUser && message.agentName && (
          <div className="flex items-center gap-1.5 pb-0.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                getAgentColor(message.agentName),
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {formatAgentLabel(message.agentName)}
            </span>
          </div>
        )}

        {isSystemEvent ? (
          <div className="rounded-2xl px-1 py-1">{systemContent}</div>
        ) : (
          <>
            <div
              className={cn(
                'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                isUser
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-card-foreground',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap break-words">
                  {message.content}
                </p>
                {!hasEvent ? <MessageActions conversationId={conversationId} messageId={message.id} message={message} /> : null}
              </div>
            </div>

            {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? (
              message.toolCalls.map((tc, i) => (
                <ToolCallCard
                  key={`${message.id}-tool-${i}`}
                  name={tc.name}
                  args={tc.args}
                  result={
                    typeof tc.result === 'string'
                      ? tc.result
                      : tc.result
                        ? JSON.stringify(tc.result)
                        : undefined
                  }
                />
              ))
            ) : null}

            {message.triageResult ? (
              <TriageResultCard
                decision={message.triageResult.decision}
                score={message.triageResult.score}
                categories={message.triageResult.categories}
                disqualifiers={message.triageResult.disqualifiers}
              />
            ) : null}

            {message.artifacts ? (
              message.artifacts.map((art, i) => (
                <ArtifactDownloadCard
                  key={`${message.id}-artifact-${i}`}
                  name={art.name}
                  fileType={art.fileType}
                  version={art.version}
                  downloadUrl={art.downloadUrl}
                />
              ))
            ) : null}
          </>
        )}

        <p className={cn('text-[10px] text-muted-foreground/60', isUser ? 'text-right' : 'text-left')}>
          {formatDateDisplay(message.createdAt)}
        </p>
      </div>

      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600">
          <span className="text-xs font-semibold text-white">U</span>
        </div>
      )}
    </div>
  );
}
