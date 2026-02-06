'use client';

import { cn } from '@/lib/utils';
import { getAgentColor, formatAgentLabel } from './AgentIndicator';
import { ToolCallCard } from './ToolCallCard';
import { TriageResultCard } from './TriageResultCard';
import { ArtifactDownloadCard } from './ArtifactDownloadCard';

interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
}

interface TriageResult {
  decision: 'ADVANCE' | 'HOLD' | 'KILL';
  score: number;
  categories?: { name: string; score: number; maxScore: number }[];
  disqualifiers?: string[];
}

interface Artifact {
  name: string;
  fileType: string;
  version?: string;
  downloadUrl: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  agentName?: string;
  toolCalls?: ToolCall[];
  triageResult?: TriageResult;
  artifacts?: Artifact[];
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-500 dark:to-slate-700">
          <span className="text-xs font-semibold text-white">G</span>
        </div>
      )}

      <div className={cn('max-w-[75%] space-y-1', isUser && 'items-end')}>
        {/* Agent badge */}
        {!isUser && message.agentName && (
          <div className="flex items-center gap-1.5 pb-0.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                getAgentColor(message.agentName)
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {formatAgentLabel(message.agentName)}
            </span>
          </div>
        )}

        {/* Message body */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border bg-card text-card-foreground'
          )}
        >
          {/* Render content as simple paragraphs (line-break aware) */}
          {message.content.split('\n').map((line, i) => (
            <p key={i} className={cn(i > 0 && 'mt-1.5', !line && 'h-2')}>
              {line}
            </p>
          ))}
        </div>

        {/* Tool calls */}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallCard key={i} name={tc.name} args={tc.args} result={tc.result} />
        ))}

        {/* Triage result */}
        {message.triageResult && (
          <TriageResultCard
            decision={message.triageResult.decision}
            score={message.triageResult.score}
            categories={message.triageResult.categories}
            disqualifiers={message.triageResult.disqualifiers}
          />
        )}

        {/* Artifacts */}
        {message.artifacts?.map((art, i) => (
          <ArtifactDownloadCard
            key={i}
            name={art.name}
            fileType={art.fileType}
            version={art.version}
            downloadUrl={art.downloadUrl}
          />
        ))}

        {/* Timestamp */}
        <p
          className={cn(
            'text-[10px] text-muted-foreground/60',
            isUser ? 'text-right' : 'text-left'
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600">
          <span className="text-xs font-semibold text-white">U</span>
        </div>
      )}
    </div>
  );
}
