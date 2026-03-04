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
import { cn } from '@/lib/utils';
import { getAgentColor, getAgentBorderColor, formatAgentLabel } from './AgentIndicator';
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
    <div className="my-2 rounded-lg border border-[#2a2f3e] bg-[#0f1118]/80 px-3 py-2 text-xs">
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <FileText className="h-3.5 w-3.5" />
        <span>{name}</span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-[#0c0e14] p-2 font-mono text-emerald-400/80">
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
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
      <span>
        <span className="font-mono font-medium text-slate-300">{title}</span>
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

  const btnClass = "inline-flex items-center gap-1 rounded-full border border-[#2a2f3e] bg-[#1a1d28] px-2.5 py-1 text-slate-400 hover:bg-[#252a38] hover:text-slate-200 transition-colors";

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

/** Event styling: left-border accent color + dark transparent bg */
const eventStyles: Record<string, { border: string; bg: string; text: string }> = {
  agent_progress: { border: 'border-l-indigo-500', bg: 'bg-indigo-500/8', text: 'text-indigo-200' },
  agent_switch: { border: 'border-l-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-200' },
  handoff: { border: 'border-l-indigo-400', bg: 'bg-indigo-500/8', text: 'text-indigo-200' },
  tool_start: { border: 'border-l-slate-500', bg: 'bg-slate-500/8', text: 'text-slate-300' },
  tool_end: { border: 'border-l-slate-500', bg: 'bg-slate-500/8', text: 'text-slate-300' },
  tool_approval: { border: 'border-l-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-200' },
  agent_summary: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/8', text: 'text-emerald-200' },
  error: { border: 'border-l-red-500', bg: 'bg-red-500/8', text: 'text-red-200' },
  tool_result: { border: 'border-l-violet-500', bg: 'bg-violet-500/8', text: 'text-violet-200' },
};

function getEventStyle(kind: string) {
  return eventStyles[kind] ?? { border: 'border-l-slate-500', bg: 'bg-slate-500/8', text: 'text-slate-300' };
}

function renderSystemContent(
  message: ChatMessage,
  conversationId?: string | null,
  onToolApprovalEvents?: (events: ChatStreamEvent[]) => void,
) {
  const eventKind = message.eventKind;
  const Icon = eventKind ? eventIcons[eventKind] : null;
  const style = eventKind ? getEventStyle(eventKind) : getEventStyle('');

  if (!eventKind) return null;

  const wrapperClass = cn(
    'rounded-lg border-l-2 px-3 py-2 text-sm',
    style.border,
    style.bg,
  );

  if (eventKind === 'agent_progress' && message.agentName) {
    return (
      <div className={wrapperClass}>
        <EventHeader
          title="Agent Progress"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined}
        />
        <p className="text-xs text-slate-400">{message.content}</p>
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="font-mono text-[11px] font-medium text-indigo-400">Tools in-flight</p>
            {message.toolCalls.map((toolCall, i) => (
              <p
                key={`${message.id}-progress-tool-${i}`}
                className="font-mono text-xs text-indigo-300"
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
      <div className={wrapperClass}>
        <EventHeader
          title="Agent Switched"
          agentName={message.agentName}
          rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={message.agentName} mode="active" />
          <span className="text-slate-400">Active agent changed.</span>
        </div>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
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
          rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <AgentStatusChip agentName={handoffTarget} mode="handoff" />
          <span className="text-slate-400">{message.content}</span>
        </div>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
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
          rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined}
        />
        <div className="flex items-center gap-2 text-xs">
          <ToolStatusChip toolName={toolName} status={status} />
          <span className="text-slate-400">{message.content}</span>
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
      <div className={wrapperClass}>
        <EventHeader
          title="Tool Approval Required"
          rightAction={Icon ? <Icon className="h-3 w-3 text-amber-400" /> : undefined}
        />
        <p className="text-xs text-slate-400">{message.content}</p>
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
          rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined}
        />
        <div className="grid gap-1 font-mono text-xs sm:grid-cols-2">
          <p className="text-slate-400">
            Confidence: <strong className="text-emerald-400">{completion}</strong>
          </p>
          <p className="text-slate-400">
            Evidence gaps: <strong className="text-amber-400">{message.trust?.missingEvidence?.length ?? 0}</strong>
          </p>
          <p className="text-slate-400">
            Tools: <strong className="text-slate-200">{message.trust?.toolsInvoked?.length ?? 0}</strong>
          </p>
          <p className="text-slate-400">
            Duration: <strong className="text-slate-200">{message.trust?.durationMs ?? 'n/a'} ms</strong>
          </p>
        </div>
        {message.trust?.errorSummary ? (
          <p className="mt-2 rounded border border-amber-800/50 bg-amber-900/20 px-2 py-1 text-xs text-amber-300">
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
        <EventHeader title="Agent Error" rightAction={Icon ? <Icon className="h-3 w-3 text-red-400" /> : undefined} />
        <p className="text-xs text-red-300">{message.content}</p>
        <MessageActions conversationId={conversationId} messageId={message.id} message={message} />
      </div>
    );
  }

  if (eventKind === 'tool_result') {
    return (
      <div className={wrapperClass}>
        <EventHeader title="Tool Result" rightAction={Icon ? <Icon className="h-3 w-3 text-slate-500" /> : undefined} />
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

  const agentBorder = !isUser && message.agentName
    ? getAgentBorderColor(message.agentName)
    : 'border-l-slate-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* Assistant avatar */}
      {!isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1e2230] to-[#2a2f3e] ring-1 ring-[#2a2f3e]">
          <span className="font-mono text-[10px] font-medium text-blue-400">G</span>
        </div>
      ) : (
        <ClipboardList className="mt-2 h-7 w-7 shrink-0 text-slate-600" />
      )}

      <div className={cn('max-w-[84%] space-y-1', isUser && 'items-end')}>
        {/* Agent label */}
        {!isSystemEvent && !isUser && message.agentName && (
          <div className="flex items-center gap-1.5 pb-0.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                getAgentColor(message.agentName),
              )}
            />
            <span className="font-mono text-[11px] font-medium text-slate-500">
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
                'rounded-lg px-4 py-3 text-sm leading-relaxed',
                isUser
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : cn(
                      'border-l-4 bg-[#1a1d28] text-slate-200',
                      agentBorder,
                    ),
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
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

        <p className={cn('font-mono text-[10px] text-slate-600', isUser ? 'text-right' : 'text-left')}>
          {formatDateDisplay(message.createdAt)}
        </p>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600">
          <span className="font-mono text-[10px] font-medium text-white">U</span>
        </div>
      )}
    </motion.div>
  );
}
