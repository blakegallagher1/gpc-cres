'use client';

import type { ComponentType } from 'react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ClipboardCopy,
  ExternalLink,
  FileText,
  GitBranch,
  RefreshCcw,
  Shield,
  Wrench,
  Rocket,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatOperatorTime } from '@/lib/formatters/operatorFormatters';
import { cn } from '@/lib/utils';
import { getAgentColor, getAgentBorderColor, formatAgentLabel, getAgentRole } from './AgentIndicator';
import { ToolCallCard } from './ToolCallCard';
import { TriageResultCard } from './TriageResultCard';
import { ArtifactDownloadCard } from './ArtifactDownloadCard';
import { BrowserSessionCard } from './BrowserSessionCard';
import { AgentStatusChip } from './AgentStatusChip';
import { ToolStatusChip } from './ToolStatusChip';
import { ToolApprovalPrompt } from './ToolApprovalPrompt';
import type { ChatMessage, ChatStreamEvent } from '@/lib/chat/types';
import { MiniMapMessage } from './MiniMapMessage';
import { useMapChatDispatch } from '@/lib/chat/MapChatContext';
import { StructuredMessageRenderer } from './StructuredMessageRenderer';
import { sanitizeChatErrorMessage } from '@/lib/chat/errorHandling';

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
  onVerifyTrust?: (messageId: string) => void;
  onRetry?: () => void;
}

export async function writeClipboardTextSafely(text: string): Promise<boolean> {
  if (!navigator?.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return false;
    }

    throw error;
  }
}

function formatTrustDuration(ms?: number): string {
  if (ms == null) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TrustIndicator({
  trust,
  messageId,
  onVerify,
}: {
  trust: NonNullable<ChatMessage['trust']>;
  messageId: string;
  onVerify?: (messageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rawConfidence = trust.confidence;
  if (rawConfidence == null) return null;

  const pct = Math.round(rawConfidence * 100);
  const toolCount = trust.toolsInvoked?.length ?? 0;
  const citationCount = trust.evidenceCitations?.length ?? 0;
  const missingCount = trust.missingEvidence?.length ?? 0;

  return (
    <div className="mt-3 rounded border border-rule bg-paper-soft px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="ed-eyebrow">Confidence</span>
        <div className="h-[3px] w-20 shrink-0 rounded bg-paper-inset">
          <div
            className="h-full rounded bg-ink transition-all"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="flex-1 font-mono text-[10.5px] text-ink-fade">
          {pct}% · {toolCount} tool{toolCount !== 1 ? 's' : ''} · {citationCount} citation{citationCount !== 1 ? 's' : ''}
        </span>
        {missingCount > 0 && (
          <span className="font-mono text-[10.5px] text-ed-warn">
            {missingCount} gap{missingCount !== 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-ink-fade transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2.5 border-t border-rule-soft pt-2">
          {trust.evidenceCitations && trust.evidenceCitations.length > 0 && (
            <div>
              <p className="ed-eyebrow mb-1">Evidence cited</p>
              <ul className="mt-1 space-y-0.5">
                {trust.evidenceCitations.map((cite, i) => (
                  <li key={i} className="font-mono text-[10.5px] text-ink-soft">
                    {typeof cite.label === 'string' ? cite.label : JSON.stringify(cite)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trust.missingEvidence && trust.missingEvidence.length > 0 && (
            <div>
              <p className="ed-eyebrow mb-1 text-ed-warn">Proof gaps</p>
              <ul className="mt-1 space-y-0.5">
                {trust.missingEvidence.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10.5px] text-ink">
                    <span className="font-bold text-ed-warn">◇</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trust.toolsInvoked && trust.toolsInvoked.length > 0 && (
            <div>
              <p className="ed-eyebrow mb-1">Tools invoked</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {trust.toolsInvoked.map((tool, i) => (
                  <span
                    key={i}
                    className="rounded border border-rule-soft bg-paper-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-soft"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="font-mono text-[10px] text-ink-fade">
            Duration: {formatTrustDuration(trust.durationMs)}
          </p>

          {onVerify && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 rounded border-rule px-3 text-[10px] text-ink-soft"
              onClick={() => onVerify(messageId)}
            >
              Verify
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatToolResultValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function ToolResultCard({ name, result }: { name: string; result: unknown }) {
  const resultText =
    typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const parsedResult =
    typeof result === 'string' ? safeParseJSON(result) ?? result : result;
  const objectEntries = isRecord(parsedResult) ? Object.entries(parsedResult) : [];
  const objectArray =
    Array.isArray(parsedResult) && parsedResult.every((item) => isRecord(item))
      ? (parsedResult as Record<string, unknown>[])
      : null;
  const primitiveArray =
    Array.isArray(parsedResult) && !objectArray ? parsedResult : null;

  return (
    <div className="my-2 rounded border border-rule-soft bg-paper-soft">
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.02em] text-ink">
          <FileText className="h-3.5 w-3.5 text-ink-soft" />
          <span>{name}</span>
        </div>
        <ScrollArea className="max-h-64 rounded border border-rule-soft bg-paper-panel">
          {objectEntries.length > 0 ? (
            <div className="divide-y divide-rule-soft">
              {objectEntries.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(0,140px)_1fr] gap-3 px-3 py-2 text-xs">
                  <p className="ed-eyebrow">{key}</p>
                  <p className="break-words text-ink-soft">{formatToolResultValue(value)}</p>
                </div>
              ))}
            </div>
          ) : objectArray ? (
            <div className="flex flex-col gap-2 p-3">
              {objectArray.slice(0, 5).map((entry, index) => (
                <div key={`${name}-${index}`} className="rounded border border-rule-soft bg-paper-panel px-3 py-2">
                  <p className="ed-eyebrow mb-2">Item {index + 1}</p>
                  <div className="space-y-2">
                    {Object.entries(entry).map(([key, value]) => (
                      <div key={`${index}-${key}`} className="grid grid-cols-[minmax(0,120px)_1fr] gap-3 text-xs">
                        <p className="ed-eyebrow">{key}</p>
                        <p className="break-words text-ink-soft">{formatToolResultValue(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : primitiveArray ? (
            <ul className="flex list-disc flex-col gap-1 px-6 py-3 text-xs text-ink-soft">
              {primitiveArray.slice(0, 10).map((item, index) => (
                <li key={`${name}-${index}`}>{formatToolResultValue(item)}</li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-ink">
              <StructuredMessageRenderer content={resultText} />
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export type { ChatMessage } from '@/lib/chat/types';

function formatDateDisplay(value: string): string {
  const formatted = formatOperatorTime(value, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatted === 'N/A' ? '' : formatted;
}

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
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
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-ink-fade">
      <span>
        <span className="font-mono font-medium text-ink">{title}</span>
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
    await writeClipboardTextSafely(message.content);
  };

  const onCopyLink = async () => {
    if (!shareHref) return;
    await writeClipboardTextSafely(shareHref);
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
  const actions = [
    { key: 'copy', label: 'Copy', icon: ClipboardCopy, onClick: onCopy, disabled: false },
    { key: 'reopen', label: 'Reopen', icon: RefreshCcw, onClick: onReopen, disabled: !conversationId },
    { key: 'share', label: 'Share link', icon: LinkIcon, onClick: onCopyLink, disabled: !shareHref },
    { key: 'source', label: 'Open source', icon: ExternalLink, onClick: onOpenSource, disabled: !hasSource },
  ].filter((action) => !action.disabled);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Tooltip key={action.key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={action.onClick}
                  className="h-7 rounded border border-rule px-2.5 text-xs text-ink-fade hover:text-ink"
                >
                  <Icon className="h-3 w-3" />
                  {action.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function SystemEventFrame({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

const eventStyles: Record<string, { border: string; bg: string; text: string }> = {
  agent_progress: { border: 'border-l-indigo-500', bg: 'bg-paper-soft', text: 'text-indigo-700 dark:text-indigo-200' },
  agent_switch: { border: 'border-l-amber-500', bg: 'bg-paper-soft', text: 'text-amber-700 dark:text-amber-200' },
  handoff: { border: 'border-l-indigo-400', bg: 'bg-paper-soft', text: 'text-indigo-700 dark:text-indigo-200' },
  tool_start: { border: 'border-l-slate-500', bg: 'bg-paper-inset', text: 'text-ink' },
  tool_end: { border: 'border-l-slate-500', bg: 'bg-paper-inset', text: 'text-ink' },
  tool_approval: { border: 'border-l-amber-500', bg: 'bg-paper-soft', text: 'text-amber-700 dark:text-amber-200' },
  agent_summary: { border: 'border-l-emerald-500', bg: 'bg-paper-soft', text: 'text-emerald-700 dark:text-emerald-200' },
  error: { border: 'border-l-red-500', bg: 'bg-paper-soft', text: 'text-destructive' },
  tool_result: { border: 'border-l-violet-500', bg: 'bg-paper-soft', text: 'text-violet-700 dark:text-violet-200' },
};

function getEventStyle(kind: string) {
  return eventStyles[kind] ?? { border: 'border-l-slate-500', bg: 'bg-paper-inset', text: 'text-ink' };
}

function getEffectiveEventKind(
  message: ChatMessage,
): ChatMessage['eventKind'] | undefined {
  if (message.eventKind) {
    return message.eventKind;
  }

  const metadataKind =
    message.metadata && typeof message.metadata.kind === 'string'
      ? message.metadata.kind
      : null;

  if (metadataKind === 'tool_approval_requested') {
    return 'tool_approval';
  }

  return undefined;
}

function renderSystemContent(
  message: ChatMessage,
  conversationId?: string | null,
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void,
  onRetry?: () => void,
) {
  const eventKind = getEffectiveEventKind(message);
  const Icon = eventKind ? eventIcons[eventKind] : null;
  const style = eventKind ? getEventStyle(eventKind) : getEventStyle('');

  if (!eventKind) return null;

  const wrapperClass = cn(
    'rounded border border-rule-soft border-l-[3px] text-sm',
    style.border,
    style.bg,
  );

  if (eventKind === 'agent_progress' && message.agentName) {
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title="Agent Progress"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <p className="text-xs text-ink-soft">{message.content}</p>
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <p className={cn('font-mono text-[11px] font-medium', style.text)}>Tools in-flight</p>
            {message.toolCalls.map((toolCall, i) => (
              <p
                key={`${message.id}-progress-tool-${i}`}
                className={cn('font-mono text-xs', style.text)}
              >
                {toolCall.name}
              </p>
            ))}
          </div>
        )}
      </SystemEventFrame>
    );
  }

  if (eventKind === 'agent_switch' && message.agentName) {
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title="Agent Switched"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={message.agentName} mode="active" />
          <span className="text-ink-soft">Active agent changed.</span>
        </div>
      </SystemEventFrame>
    );
  }

  if (eventKind === 'handoff') {
    const handoffTarget = message.agentName ?? 'Specialist';
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title="Agent Handoff"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={handoffTarget} mode="handoff" />
          <span className="text-ink-soft">{message.content}</span>
        </div>
      </SystemEventFrame>
    );
  }

  if (eventKind === 'tool_start' || eventKind === 'tool_end') {
    const toolName = message.toolCalls?.[0]?.name ?? message.agentName ?? 'tool';
    const status = eventKind === 'tool_start' ? 'running' : 'completed';
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title={eventKind === 'tool_start' ? 'Tool Started' : 'Tool Completed'}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <ToolStatusChip toolName={toolName} status={status} />
          <span className="text-ink-soft">{message.content}</span>
        </div>
      </SystemEventFrame>
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
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title="Tool Approval Required"
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <p className="text-xs text-ink-soft">{message.content}</p>
        {runId && toolCallId ? (
          <ToolApprovalPrompt
            runId={runId}
            toolCallId={toolCallId}
            toolName={toolName}
            args={args}
            onEvents={onToolApprovalEvents}
          />
        ) : null}
      </SystemEventFrame>
    );
  }

  if (eventKind === 'agent_summary') {
    const confidence = message.trust?.confidence;
    const completion = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'N/A';
    const agent = message.trust?.lastAgentName ?? message.agentName ?? 'Coordinator';

    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader
          title="Agent Summary"
          agentName={agent}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="grid gap-1 font-mono text-xs sm:grid-cols-2">
          <p className="text-ink-soft">
            Confidence: <strong className="text-ed-ok">{completion}</strong>
          </p>
          <p className="text-ink-soft">
            Evidence gaps: <strong className="text-ed-warn">{message.trust?.missingEvidence?.length ?? 0}</strong>
          </p>
          <p className="text-ink-soft">
            Tools: <strong className="text-ink">{message.trust?.toolsInvoked?.length ?? 0}</strong>
          </p>
          <p className="text-ink-soft">
            Duration: <strong className="text-ink">{message.trust?.durationMs ?? 'n/a'} ms</strong>
          </p>
        </div>
        {message.trust?.errorSummary ? (
          <p className="mt-2 rounded border border-ed-warn/40 bg-[oklch(var(--ed-warn-soft))] px-2 py-1 text-xs text-ink">
            {message.trust.errorSummary}
          </p>
        ) : null}
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </SystemEventFrame>
    );
  }

  if (eventKind === 'error') {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const correlationId = typeof metadata.correlationId === 'string' ? metadata.correlationId : undefined;
    const toolName = typeof metadata.toolName === 'string' ? metadata.toolName : undefined;
    const sanitizedError = sanitizeChatErrorMessage(message.content, correlationId);

    return (
      <SystemEventFrame className={wrapperClass}>
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="ed-eyebrow text-destructive">Agent Error</p>
            <p className="text-xs text-destructive/90">{sanitizedError.message}</p>
            {toolName ? (
              <p className="font-mono text-[10px] text-ink-fade">
                Failed during: <span className="text-ink-soft">{toolName}</span>
              </p>
            ) : null}
            {sanitizedError.correlationId ? (
              <code className="rounded bg-paper-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-fade">
                {sanitizedError.correlationId}
              </code>
            ) : null}
            {onRetry ? (
              <div className="mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="h-7 rounded border-rule px-3 text-xs text-ink-fade"
                >
                  <RefreshCcw className="mr-1.5 h-3 w-3" />
                  Retry this message
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </SystemEventFrame>
    );
  }

  if (eventKind === 'tool_result') {
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader title="Tool Result" rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined} />
        <ToolResultCard
          name={message.agentName ?? 'tool'}
          result={message.content.length > 0 ? message.content : 'No result available'}
        />
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </SystemEventFrame>
    );
  }

  return null;
}

export function MessageBubble({
  message,
  conversationId,
  onToolApprovalEvents,
  onVerifyTrust,
  onRetry,
}: MessageBubbleProps) {
  const mapDispatch = useMapChatDispatch();
  const effectiveEventKind = getEffectiveEventKind(message);
  const isUser = message.role === 'user';
  const isSystemEvent = effectiveEventKind !== undefined && effectiveEventKind !== 'assistant';
  const hasEvent = effectiveEventKind !== undefined;
  const systemContent = renderSystemContent(message, conversationId, onToolApprovalEvents, onRetry);

  const time = message.createdAt ? formatDateDisplay(message.createdAt) : '';

  if (isSystemEvent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="pl-4"
      >
        {systemContent}
      </motion.div>
    );
  }

  if (isUser) {
    return (
      <UserBlock message={message} time={time}>
        <StructuredMessageRenderer content={message.content} />
        {!hasEvent ? (
          <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
        ) : null}
      </UserBlock>
    );
  }

  const agentName = message.agentName ?? 'Coordinator';
  const swatch = getAgentColor(agentName);
  const label = formatAgentLabel(agentName);
  const role = getAgentRole(agentName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card
        className={cn(
          'overflow-hidden rounded border bg-paper-panel p-0',
          'border-rule',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule-soft bg-paper-soft px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn('h-2.5 w-2.5 shrink-0', swatch)} style={{ borderRadius: 1 }} />
            <span className="font-display text-[13px] font-semibold text-ink">{label}</span>
            <span className="ed-eyebrow-tight">{role}</span>
          </div>
          <div className="flex items-baseline gap-2.5">
            {time && <span className="font-mono text-[10.5px] text-ink-fade">{time}</span>}
          </div>
        </div>
        <CardContent className="px-5 py-3.5 text-[14px] leading-[1.6] text-ink">
          <StructuredMessageRenderer content={message.content} />
          {Array.isArray(message.mapFeatures) && message.mapFeatures.length > 0 ? (
            <MiniMapMessage
              features={message.mapFeatures}
              onParcelClick={(parcel) => {
                mapDispatch({ type: 'SELECT_PARCELS', parcelIds: [parcel.parcelId] });
              }}
            />
          ) : null}
          {message.trust && message.trust.confidence != null && !hasEvent ? (
            <TrustIndicator
              trust={message.trust}
              messageId={message.id}
              onVerify={onVerifyTrust}
            />
          ) : null}
          {!hasEvent ? (
            <MessageActions
              conversationId={conversationId}
              messageId={message.id}
              message={message}
            />
          ) : null}
        </CardContent>
      </Card>

      {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? (
        message.toolCalls.map((tc, i) => {
          if (tc.name === 'browser_task' && tc.result) {
            const parsed = typeof tc.result === 'string'
              ? safeParseJSON(tc.result)
              : tc.result;
            if (parsed && typeof parsed === 'object') {
              const r = parsed as {
                success?: boolean;
                data?: unknown;
                error?: string;
                screenshots?: string[];
                turns?: number;
                modeUsed?: string;
                cost?: { inputTokens: number; outputTokens: number };
                finalMessage?: string;
                source?: { url: string; fetchedAt: string };
                url?: string;
              };
              return (
                <BrowserSessionCard
                  key={`${message.id}-browser-${i}`}
                  url={r.source?.url ?? r.url ?? ''}
                  success={r.success ?? false}
                  screenshots={r.screenshots ?? []}
                  turns={r.turns ?? 0}
                  modeUsed={r.modeUsed ?? 'native'}
                  cost={r.cost}
                  data={r.data}
                  error={r.error}
                  finalMessage={r.finalMessage}
                  source={r.source}
                />
              );
            }
          }
          return (
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
          );
        })
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
    </motion.div>
  );
}

function UserBlock({ message, time, children }: { message: ChatMessage; time: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const ok = await writeClipboardTextSafely(message.content ?? '');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="group rounded border border-rule border-l-[3px] border-l-ink bg-paper-panel px-4 py-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[12.5px] font-semibold text-ink">You</span>
            {time && <span className="font-mono text-[10.5px] text-ink-fade">{time}</span>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onCopy}
            aria-label="Copy message"
          >
            <ClipboardCopy className="h-3.5 w-3.5 text-ink-fade" />
          </Button>
        </div>
        <div className="text-[14.5px] font-medium leading-[1.55] text-ink">{children}</div>
        {copied && <span className="ed-eyebrow mt-1 block text-ed-ok">Copied</span>}
      </div>
    </motion.div>
  );
}
