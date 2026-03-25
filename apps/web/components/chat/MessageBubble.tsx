'use client';

import type { ComponentType } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
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
import { formatOperatorTime } from '@/lib/formatters/operatorFormatters';
import { cn } from '@/lib/utils';
import { getAgentColor, getAgentBorderColor, formatAgentLabel } from './AgentIndicator';
import { ToolCallCard } from './ToolCallCard';
import { TriageResultCard } from './TriageResultCard';
import { ArtifactDownloadCard } from './ArtifactDownloadCard';
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
}

function ToolResultCard({ name, result }: { name: string; result: unknown }) {
  return (
    <div className="my-2 rounded-2xl border border-border/60 bg-background/75 px-3 py-3 text-xs">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span>{name}</span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/35 p-3 font-mono text-foreground/80">
        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
      </pre>
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

  const btnClass =
    'inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-background hover:text-foreground';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" onClick={onCopy} className={btnClass}>
        <ClipboardCopy className="h-3 w-3" />
        Copy
      </button>

      {conversationId ? (
        <button type="button" onClick={onReopen} className={btnClass}>
          <RefreshCcw className="h-3 w-3" />
          Reopen
        </button>
      ) : null}

      {shareHref ? (
        <button type="button" onClick={onCopyLink} className={btnClass}>
          <LinkIcon className="h-3 w-3" />
          Share link
        </button>
      ) : null}

      {hasSource ? (
        <button type="button" onClick={onOpenSource} className={btnClass}>
          <ExternalLink className="h-3 w-3" />
          Open source
        </button>
      ) : null}
    </div>
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
      <div className={wrapperClass}>
        <EventHeader
          title="Agent Progress"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <p className="text-xs text-muted-foreground">{message.content}</p>
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
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
      </div>
    );
  }

  if (eventKind === 'agent_switch' && message.agentName) {
    return (
      <div className={wrapperClass}>
        <EventHeader
          title="Agent Switched"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={message.agentName} mode="active" />
          <span className="text-muted-foreground">Active agent changed.</span>
        </div>
      </div>
    );
  }

  if (eventKind === 'handoff') {
    const handoffTarget = message.agentName ?? 'Specialist';
    return (
      <div className={wrapperClass}>
        <EventHeader
          title="Agent Handoff"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={handoffTarget} mode="handoff" />
          <span className="text-muted-foreground">{message.content}</span>
        </div>
      </div>
    );
  }

  if (eventKind === 'tool_start' || eventKind === 'tool_end') {
    const toolName = message.toolCalls?.[0]?.name ?? message.agentName ?? 'tool';
    const status = eventKind === 'tool_start' ? 'running' : 'completed';
    return (
      <div className={wrapperClass}>
        <EventHeader
          title={eventKind === 'tool_start' ? 'Tool Started' : 'Tool Completed'}
          rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <ToolStatusChip toolName={toolName} status={status} />
          <span className="text-muted-foreground">{message.content}</span>
        </div>
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
      <div className={wrapperClass}>
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
      </div>
    );
  }

  if (eventKind === 'agent_summary') {
    const confidence = message.trust?.confidence;
    const completion = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'N/A';
    const agent = message.trust?.lastAgentName ?? message.agentName ?? 'Coordinator';

    return (
      <div className={wrapperClass}>
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
      </div>
    );
  }

  if (eventKind === 'error') {
    return (
      <div className={wrapperClass}>
        <EventHeader title="Agent Error" rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined} />
        <p className="text-xs text-destructive">{message.content}</p>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'tool_result') {
    return (
      <div className={wrapperClass}>
        <EventHeader title="Tool Result" rightAction={Icon ? <Icon className={cn('h-3 w-3', style.text)} /> : undefined} />
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
          'space-y-1',
          isSystemEvent ? 'max-w-[92%]' : 'max-w-[84%]',
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
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                isUser
                  ? 'bg-primary text-primary-foreground shadow-[0_18px_48px_-32px_rgba(15,23,42,0.45)]'
                  : cn(
                      'border border-border/60 border-l-[3px] bg-background/80 text-foreground',
                      agentBorder,
                    ),
              )}
            >
              <StructuredMessageRenderer content={message.content} />
              {Array.isArray(message.mapFeatures) && message.mapFeatures.length > 0 ? (
                <MiniMapMessage
                  features={message.mapFeatures}
                  onParcelClick={(parcelId) => {
                    mapDispatch({ type: 'SELECT_PARCELS', parcelIds: [parcelId] });
                  }}
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
