'use client';

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  ListChecks,
  MemoryStick,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentTrustEnvelope } from '@/types';
import type { OperatorContextItem } from '@/lib/chat/operatorContext';

type MissionSignalTone = 'neutral' | 'positive' | 'warning' | 'critical';

type MissionSignal = {
  label: string;
  value: string;
  detail: string;
  tone?: MissionSignalTone;
};

export type MissionControlState = {
  activeAgentLabel: string;
  attachmentStatusLabel: string;
  conversationCount: number;
  recentConversationLabel: string;
  threadStatusLabel: string;
  transportLabel: string;
  agentSummary: AgentTrustEnvelope | null;
  contextItems?: OperatorContextItem[];
  onRemoveContextItem?: (itemId: string) => void;
};

function toneClass(tone: MissionSignalTone = 'neutral') {
  switch (tone) {
    case 'positive':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'critical':
      return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    case 'neutral':
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function signalFromSummary(summary: AgentTrustEnvelope | null): MissionSignal[] {
  const missingEvidence = summary?.missingEvidence?.length ?? 0;
  const toolFailures = summary?.toolFailures?.length ?? 0;
  const confidence = summary ? `${Math.round(summary.confidence * 100)}%` : 'Pending';

  return [
    {
      label: 'Confidence',
      value: confidence,
      detail: summary ? 'Latest trust envelope score' : 'Waiting on first completed run',
      tone: summary && summary.confidence >= 0.75 ? 'positive' : 'neutral',
    },
    {
      label: 'Evidence gaps',
      value: String(missingEvidence),
      detail: missingEvidence > 0 ? 'Operator review required' : 'No gaps surfaced yet',
      tone: missingEvidence > 0 ? 'warning' : 'positive',
    },
    {
      label: 'Tool failures',
      value: String(toolFailures),
      detail: toolFailures > 0 ? 'Inspect failed tool calls' : 'No failures in latest summary',
      tone: toolFailures > 0 ? 'critical' : 'positive',
    },
  ];
}

function MissionStat({ signal }: { signal: MissionSignal }) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2.5', toneClass(signal.tone))}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-75">
        {signal.label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">
        {signal.value}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 opacity-80">{signal.detail}</p>
    </div>
  );
}

function MissionRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-background/70 px-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function buildPlanItems(summary: AgentTrustEnvelope | null) {
  if (!summary) {
    return [
      'Attach deal, parcel, run, or command-center context.',
      'Dispatch mission and watch the tool timeline.',
      'Review evidence, approvals, and memory writes before acting.',
    ];
  }

  if (summary.missingEvidence.length > 0) {
    return [
      'Resolve missing evidence called out by the latest run.',
      'Re-run or continue with the stronger source set.',
      'Promote verified conclusions into the next operating step.',
    ];
  }

  return [
    'Trust envelope captured for the latest run.',
    'Use cited evidence and tool history to decide the next move.',
    'Launch a follow-up mission if the recommendation needs execution.',
  ];
}

export function MissionControlPanel({
  state,
  className,
}: {
  state: MissionControlState;
  className?: string;
}) {
  const signals = signalFromSummary(state.agentSummary);
  const planItems = buildPlanItems(state.agentSummary);
  const toolsInvoked = state.agentSummary?.toolsInvoked ?? [];
  const contextItems = state.contextItems ?? [];
  const evidenceCount = state.agentSummary?.evidenceCitations?.length ?? 0;
  const verificationCount = state.agentSummary?.verificationSteps?.length ?? 0;
  const memoryStatus =
    toolsInvoked.some((tool) => tool.includes('memory') || tool === 'store_memory')
      ? 'Memory touched'
      : 'No memory writes yet';

  return (
    <section
      aria-label="Mission control"
      className={cn(
        'rounded-[28px] border border-border bg-background/92 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 rounded-full px-2.5 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              Mission control
            </Badge>
            <Badge variant="secondary" className="rounded-full px-2.5 py-1">
              {state.transportLabel}
            </Badge>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
            Visible operator intelligence
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Track context, plan, tools, evidence, approvals, and memory from one desk
            before you trust the recommendation.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2 text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Thread
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{state.threadStatusLabel}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {signals.map((signal) => (
          <MissionStat key={signal.label} signal={signal} />
        ))}
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        <MissionRow
          icon={Bot}
          label="Active agent"
          value={`Agent: ${state.activeAgentLabel}`}
          detail="Current specialist or coordinator handling the mission."
        />
        <MissionRow
          icon={Database}
          label="Context pack"
          value={
            contextItems.length > 0
              ? `${contextItems.length} context item${contextItems.length === 1 ? '' : 's'}`
              : state.attachmentStatusLabel
          }
          detail="Visible working context that will be sent into the next run."
        />
        <MissionRow
          icon={Wrench}
          label="Tool timeline"
          value={toolsInvoked.length > 0 ? `${toolsInvoked.length} tools invoked` : 'No tools yet'}
          detail={toolsInvoked.slice(0, 3).join(', ') || 'Tool activity will appear after dispatch.'}
        />
        <MissionRow
          icon={FileSearch}
          label="Evidence"
          value={`${evidenceCount} citations`}
          detail={`${verificationCount} verification steps captured in the latest summary.`}
        />
        <MissionRow
          icon={MemoryStick}
          label="Memory"
          value={memoryStatus}
          detail="Memory interactions remain explicit so facts can be trusted or challenged."
        />
        <MissionRow
          icon={Clock3}
          label="Continuity"
          value={state.recentConversationLabel}
          detail={`${state.conversationCount} conversations are available for operator recall.`}
        />
      </div>

      {contextItems.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/70 p-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Attached working context
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {contextItems.map((item) => (
              <span
                key={`${item.source}:${item.id}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1.5 text-xs text-foreground"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {item.source}
                </span>
                <span className="truncate">{item.label}</span>
                {item.detail ? (
                  <span className="hidden max-w-[260px] truncate text-muted-foreground sm:inline">
                    {item.detail}
                  </span>
                ) : null}
                {state.onRemoveContextItem ? (
                  <button
                    type="button"
                    className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Remove ${item.label} context`}
                    onClick={() => state.onRemoveContextItem?.(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-border bg-muted/35 p-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Live plan
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          {planItems.map((item, index) => {
            const complete = state.agentSummary !== null && index === 0;
            const Icon = complete ? CheckCircle2 : index === 1 ? PlayCircle : AlertTriangle;
            return (
              <div key={item} className="flex items-start gap-2 text-sm">
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    complete ? 'text-emerald-500' : 'text-muted-foreground',
                  )}
                />
                <span className="leading-5 text-foreground/85">{item}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-background/70 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Next operator actions
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'Review evidence gaps',
            'Continue mission',
            'Create follow-up task',
            'Attach stronger context',
          ].map((action) => (
            <Badge key={action} variant="outline" className="rounded-full px-2.5 py-1">
              {action}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
