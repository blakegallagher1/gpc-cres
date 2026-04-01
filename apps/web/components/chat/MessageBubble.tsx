'use client';

import type { ComponentType } from 'react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCopy,
  ClipboardList,
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
import { getAgentColor, getAgentBorderColor, formatAgentLabel } from './AgentIndicator';
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
}

function formatTrustDuration(ms?: number): string {
  if (ms == null) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getTrustBarColor(confidence: number): string {
  if (confidence >= 80) return 'bg-emerald-500';
  if (confidence >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getTrustBarTrack(confidence: number): string {
  if (confidence >= 80) return 'bg-emerald-500/15';
  if (confidence >= 50) return 'bg-amber-500/15';
  return 'bg-red-500/15';
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
    <div className="mt-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      {/* Compact bar — clickable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Shield className="h-3 w-3 shrink-0 text-muted-foreground" />
        {/* Confidence bar */}
        <div className={cn('h-1.5 w-20 shrink-0 rounded-full', getTrustBarTrack(pct))}>
          <div
            className={cn('h-full rounded-full transition-all', getTrustBarColor(pct))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="flex-1 font-mono text-[10px] text-muted-foreground">
          {pct}% confidence · {toolCount} tool{toolCount !== 1 ? 's' : ''} · {citationCount} citation{citationCount !== 1 ? 's' : ''}
        </span>
        {missingCount > 0 && (
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
            {missingCount} evidence gap{missingCount !== 1 ? 's' : ''}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
          {/* Evidence citations */}
          {trust.evidenceCitations && trust.evidenceCitations.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Evidence Citations
              </p>
              <ul className="mt-1 space-y-0.5">
                {trust.evidenceCitations.map((cite, i) => (
                  <li key={i} className="font-mono text-[10px] text-foreground/70">
                    {typeof cite.label === 'string' ? cite.label : JSON.stringify(cite)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing evidence */}
          {trust.missingEvidence && trust.missingEvidence.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Missing Evidence
              </p>
              <ul className="mt-1 space-y-0.5">
                {trust.missingEvidence.map((item, i) => (
                  <li key={i} className="font-mono text-[10px] text-amber-700 dark:text-amber-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tools invoked */}
          {trust.toolsInvoked && trust.toolsInvoked.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tools Invoked
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {trust.toolsInvoked.map((tool, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <p className="font-mono text-[10px] text-muted-foreground">
            Duration: {formatTrustDuration(trust.durationMs)}
          </p>

          {/* Verify button */}
          {onVerify && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 rounded-full px-3 text-[10px]"
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

function ToolResultCard({ name, result }: { name: string; result: unknown }) {
  return (
    <Card className="my-2 border-border/60 bg-background/75">
      <CardContent className="flex flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span>{name}</span>
        </div>
        <ScrollArea className="max-h-64 rounded-xl border border-border/60 bg-muted/35">
          <pre className="whitespace-pre-wrap p-3 font-mono text-foreground/80">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
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
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        <span className="font-mono font-medium text-foreground">{title}</span>
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
  const actions = [
    {
      key: 'copy',
      label: 'Copy',
      icon: ClipboardCopy,
      onClick: onCopy,
      disabled: false,
    },
    {
      key: 'reopen',
      label: 'Reopen',
      icon: RefreshCcw,
      onClick: onReopen,
      disabled: !conversationId,
    },
    {
      key: 'share',
      label: 'Share link',
      icon: LinkIcon,
      onClick: onCopyLink,
      disabled: !shareHref,
    },
    {
      key: 'source',
      label: 'Open source',
      icon: ExternalLink,
      onClick: onOpenSource,
      disabled: !hasSource,
    },
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
                  variant="outline"
                  size="sm"
                  onClick={action.onClick}
                  className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
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
    <Card className={className}>
      <CardContent className="px-3 py-2.5">{children}</CardContent>
    </Card>
  );
}

/** Event styling: left-border accent color + muted panel surface. */
const eventStyles: Record<string, { border: string; bg: string; text: string }> = {
  agent_progress: { border: 'border-l-indigo-500', bg: 'bg-indigo-500/8', text: 'text-indigo-700 dark:text-indigo-200' },
  agent_switch: { border: 'border-l-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-700 dark:text-amber-200' },
  handoff: { border: 'border-l-indigo-400', bg: 'bg-indigo-500/8', text: 'text-indigo-700 dark:text-indigo-200' },
  tool_start: { border: 'border-l-slate-500', bg: 'bg-muted/50', text: 'text-foreground' },
  tool_end: { border: 'border-l-slate-500', bg: 'bg-muted/50', text: 'text-foreground' },
  tool_approval: { border: 'border-l-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-700 dark:text-amber-200' },
  agent_summary: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/8', text: 'text-emerald-700 dark:text-emerald-200' },
  error: { border: 'border-l-red-500', bg: 'bg-destructive/8', text: 'text-destructive' },
  tool_result: { border: 'border-l-violet-500', bg: 'bg-violet-500/8', text: 'text-violet-700 dark:text-violet-200' },
};

function getEventStyle(kind: string) {
  return eventStyles[kind] ?? { border: 'border-l-slate-500', bg: 'bg-muted/50', text: 'text-foreground' };
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
) {
  const eventKind = getEffectiveEventKind(message);
  const Icon = eventKind ? eventIcons[eventKind] : null;
  const style = eventKind ? getEventStyle(eventKind) : getEventStyle('');

  if (!eventKind) return null;

  const wrapperClass = cn(
    'rounded-xl border border-border/60 border-l-[3px] px-3 py-2.5 text-sm',
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
        <p className="text-xs text-muted-foreground">{message.content}</p>
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
          <span className="text-muted-foreground">Active agent changed.</span>
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
          <span className="text-muted-foreground">{message.content}</span>
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
          <span className="text-muted-foreground">{message.content}</span>
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
        <p className="text-xs text-muted-foreground">{message.content}</p>
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
          <p className="text-muted-foreground">
            Confidence: <strong className="text-emerald-600 dark:text-emerald-400">{completion}</strong>
          </p>
          <p className="text-muted-foreground">
            Evidence gaps: <strong className="text-amber-600 dark:text-amber-400">{message.trust?.missingEvidence?.length ?? 0}</strong>
          </p>
          <p className="text-muted-foreground">
            Tools: <strong className="text-foreground">{message.trust?.toolsInvoked?.length ?? 0}</strong>
          </p>
          <p className="text-muted-foreground">
            Duration: <strong className="text-foreground">{message.trust?.durationMs ?? 'n/a'} ms</strong>
          </p>
        </div>
        {message.trust?.errorSummary ? (
          <p className="mt-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
            {message.trust.errorSummary}
          </p>
        ) : null}
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </SystemEventFrame>
    );
  }

  if (eventKind === 'error') {
    return (
      <SystemEventFrame className={wrapperClass}>
        <EventHeader title="Agent Error" rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined} />
        <p className="text-xs text-destructive">{message.content}</p>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
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
}: MessageBubbleProps) {
  const mapDispatch = useMapChatDispatch();
  const effectiveEventKind = getEffectiveEventKind(message);
  const isUser = message.role === 'user';
  const isSystemEvent = effectiveEventKind !== undefined && effectiveEventKind !== 'assistant';
  const hasEvent = effectiveEventKind !== undefined;
  const systemContent = renderSystemContent(message, conversationId, onToolApprovalEvents);
  const showAssistantAvatar = !isUser && !isSystemEvent;

  const agentBorder = !isUser && message.agentName
    ? getAgentBorderColor(message.agentName)
    : 'border-l-border';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'flex w-full gap-3',
        isUser ? 'justify-end' : 'justify-start',
        isSystemEvent && 'pl-11',
      )}
    >
      {/* Assistant avatar */}
      {showAssistantAvatar ? (
        <div className="app-shell-panel mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <span className="font-mono text-[10px] font-medium text-foreground">G</span>
        </div>
      ) : isUser ? (
        <ClipboardList className="mt-2 h-7 w-7 shrink-0 text-muted-foreground" />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-1',
          isSystemEvent ? 'max-w-[92%]' : isUser ? 'max-w-[78%] sm:max-w-[72%]' : 'w-full max-w-[92%]',
          isUser && 'items-end',
        )}
      >
        {/* Agent label */}
        {!isSystemEvent && !isUser && message.agentName && (
          <div className="flex items-center gap-1.5 pb-0.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                getAgentColor(message.agentName),
              )}
            />
            <span className="font-mono text-[11px] font-medium text-muted-foreground">
              {formatAgentLabel(message.agentName)}
            </span>
          </div>
        )}

        {isSystemEvent ? (
          <div className="py-0.5">{systemContent}</div>
        ) : (
          <>
            {isUser ? (
              <div className="rounded-2xl bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-[0_18px_48px_-32px_rgba(15,23,42,0.45)]">
                <StructuredMessageRenderer content={message.content} />
                {!hasEvent ? (
                  <MessageActions
                    conversationId={conversationId}
                    messageId={message.id}
                    message={message}
                  />
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  'overflow-hidden rounded-[1.35rem] border border-border/55 bg-background/88 text-foreground shadow-[0_24px_60px_-46px_rgba(15,23,42,0.72)]',
                  agentBorder,
                )}
              >
                <div className="px-5 py-4 text-sm leading-7">
                  <StructuredMessageRenderer content={message.content} />
                  {(Array.isArray(message.mapFeatures) && message.mapFeatures.length > 0) ||
                  (message.trust && message.trust.confidence != null && !hasEvent) ||
                  !hasEvent ? (
                    <div className="mt-4 flex flex-col gap-3 border-t border-border/45 pt-3">
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
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? (
              message.toolCalls.map((tc, i) => {
                // Detect browser_task tool and render special card
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
          </>
        )}

        <p className={cn('font-mono text-[10px] text-muted-foreground', isUser ? 'text-right' : 'text-left')}>
          {formatDateDisplay(message.createdAt)}
        </p>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <span className="font-mono text-[10px] font-medium text-primary-foreground">U</span>
        </div>
      )}
    </motion.div>
  );
}
