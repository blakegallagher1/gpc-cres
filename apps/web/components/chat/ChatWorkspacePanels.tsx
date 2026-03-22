'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { AgentStatePanel } from '@/components/agent-state/AgentStatePanel';
import { useAgents } from '@/lib/hooks/useAgents';
import { AgentTrustEnvelope } from '@/types';
import {
  CHAT_WORKSPACE_CAPABILITIES,
  CHAT_WORKSPACE_STEPS,
} from './chatWorkspaceContent';

interface ChatWorkspaceHeroProps {
  activeAgentLabel: string;
  attachmentStatusLabel: string;
  conversationCount: number;
  dealSelector: ReactNode;
  recentConversationLabel: string;
  scopeLabel: string;
  threadStatusLabel: string;
  transportLabel: string;
}

interface ChatWorkspaceInspectorProps {
  activeAgentLabel: string;
  agentSummary: AgentTrustEnvelope | null;
  attachmentStatusLabel: string;
  conversationCount: number;
  recentConversationLabel: string;
  threadStatusLabel: string;
  useAgentSummaryPanel: boolean;
}

const HERO_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as const,
};

function formatWorkspaceAgentLabel(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Dense launch header for the primary chat workspace. */
export function ChatWorkspaceHero({
  activeAgentLabel,
  attachmentStatusLabel,
  conversationCount,
  dealSelector,
  recentConversationLabel,
  scopeLabel,
  threadStatusLabel,
  transportLabel,
}: ChatWorkspaceHeroProps) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion || process.env.NODE_ENV === 'test'
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: HERO_TRANSITION,
      };

  return (
    <motion.section className="workspace-hero px-4 py-5 sm:px-6" {...motionProps}>
      <div className="workspace-hero-grid gap-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-3">
              <p className="workspace-eyebrow">Agent Operating Desk</p>
              <div className="space-y-2">
                <h2 className="workspace-title max-w-4xl text-[clamp(2.2rem,4vw,3.75rem)]">
                  Run acquisition, entitlement, and capital work from one thread.
                </h2>
                <p className="workspace-subtitle max-w-3xl">
                  Keep scope attached, ask for a concrete output, and watch the live
                  tool, evidence, and handoff lane as specialists take over.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Stateful thread</Badge>
              <Badge variant="secondary">Specialist handoffs</Badge>
              <Badge variant="secondary">Tool-backed runs</Badge>
              <Badge variant="secondary">Verification visible</Badge>
            </div>
          </div>

          <div className="flex min-w-0 max-w-xl flex-col gap-3 xl:w-[27rem]">
            {dealSelector}
            <div className="workspace-toolbar flex-col items-start gap-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Prompt Shape</p>
                <h3 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  Ask like an operator, not a browser.
                </h3>
              </div>
              <div className="grid gap-3 text-sm leading-6 text-muted-foreground">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
                    Scope
                  </span>{' '}
                  Address, parcel id, deal, market, or attached file.
                </div>
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
                    Output
                  </span>{' '}
                  Screen, memo, checklist, comparison, model note, or action plan.
                </div>
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
                    Constraints
                  </span>{' '}
                  State assumptions, timing, approval bar, or decision thresholds up front.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="workspace-stat-grid md:grid-cols-2 xl:grid-cols-4">
            <div className="workspace-stat">
              <p className="workspace-stat-label">Scope</p>
              <p className="workspace-stat-value text-xl">{scopeLabel}</p>
              <p className="workspace-stat-detail">Deal-linked scope unlocks uploads and stronger context.</p>
            </div>
            <div className="workspace-stat">
              <p className="workspace-stat-label">Thread</p>
              <p className="workspace-stat-value text-xl">{threadStatusLabel}</p>
              <p className="workspace-stat-detail">Reopen saved runs from the rail without losing the working thread.</p>
            </div>
            <div className="workspace-stat">
              <p className="workspace-stat-label">Agent</p>
              <p className="workspace-stat-value text-xl">{activeAgentLabel}</p>
              <p className="workspace-stat-detail">Coordinator or specialist currently driving the run.</p>
            </div>
            <div className="workspace-stat">
              <p className="workspace-stat-label">Transport</p>
              <p className="workspace-stat-value text-xl">{transportLabel}</p>
              <p className="workspace-stat-detail">Streaming transport currently carrying tool and model events.</p>
            </div>
          </div>

          <div className="workspace-surface workspace-surface-muted rounded-2xl p-5 shadow-none">
            <div className="border-b border-border/60 pb-4">
              <p className="workspace-eyebrow text-[10px]">Run Playbook</p>
              <h3 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                Make the first turn high signal.
              </h3>
            </div>
            <div className="mt-4 space-y-4">
              {CHAT_WORKSPACE_STEPS.map((step, index) => (
                <div key={step.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-[11px] font-semibold text-foreground">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </div>
              ))}
              <div className="grid gap-3 border-t border-border/60 pt-4 text-sm md:grid-cols-3 xl:grid-cols-1">
                <div>
                  <p className="workspace-stat-label">Attachments</p>
                  <p className="mt-2 text-foreground">{attachmentStatusLabel}</p>
                </div>
                <div>
                  <p className="workspace-stat-label">Saved Runs</p>
                  <p className="mt-2 text-foreground">{conversationCount}</p>
                </div>
                <div>
                  <p className="workspace-stat-label">Recent Activity</p>
                  <p className="mt-2 text-foreground">{recentConversationLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** Right-rail inspector for execution guidance, specialist coverage, and verification. */
export function ChatWorkspaceInspector({
  activeAgentLabel,
  agentSummary,
  attachmentStatusLabel,
  conversationCount,
  recentConversationLabel,
  threadStatusLabel,
  useAgentSummaryPanel,
}: ChatWorkspaceInspectorProps) {
  const { agents } = useAgents();
  const highlightedAgents = agents.slice(0, 6);
  const overflowAgentCount = Math.max(0, agents.length - highlightedAgents.length);

  return (
    <div className="hidden w-[23rem] border-l border-border/60 bg-background/72 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="border-b border-border/60 px-5 py-5">
        <p className="workspace-eyebrow text-[10px]">Live Execution</p>
        <h3 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
          Tool, agent, and verification control lane
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          This rail keeps stateful thread context, specialist coverage, and
          run verification visible while the thread stays focused on the work.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-border/60 px-5 py-4 text-[11px]">
        <div>
          <p className="workspace-stat-label">Thread</p>
          <p className="mt-1 text-sm font-medium text-foreground">{threadStatusLabel}</p>
        </div>
        <div>
          <p className="workspace-stat-label">Agent</p>
          <p className="mt-1 text-sm font-medium text-foreground">{activeAgentLabel}</p>
        </div>
        <div>
          <p className="workspace-stat-label">Attachments</p>
          <p className="mt-1 text-sm font-medium text-foreground">{attachmentStatusLabel}</p>
        </div>
        <div>
          <p className="workspace-stat-label">History</p>
          <p className="mt-1 text-sm font-medium text-foreground">{recentConversationLabel}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-5">
          <section className="space-y-3 border-b border-border/60 pb-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Execution Contract</p>
                <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  What this desk expects from the user
                </h4>
              </div>
              <Badge variant="outline">{conversationCount} saved</Badge>
            </div>
            <div className="space-y-3 text-sm leading-6">
              {CHAT_WORKSPACE_STEPS.map((step, index) => (
                <div key={step.title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 text-[10px] font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p className="text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-b border-border/60 pb-5">
            <div>
              <p className="workspace-eyebrow text-[10px]">Capabilities Live</p>
              <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                Current product contract
              </h4>
            </div>
            <div className="space-y-3 text-sm leading-6">
              {CHAT_WORKSPACE_CAPABILITIES.map((capability) => (
                <div key={capability.label}>
                  <p className="font-medium text-foreground">{capability.label}</p>
                  <p className="text-muted-foreground">{capability.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-b border-border/60 pb-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Specialist Coverage</p>
                <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  Agents on this desk
                </h4>
              </div>
              <Badge variant="secondary">{agents.length}</Badge>
            </div>
            <div className="space-y-3">
              {highlightedAgents.map((agent) => (
                <div key={agent.id} className="rounded-xl border border-border/60 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {formatWorkspaceAgentLabel(agent.name)}
                    </p>
                    <Badge variant="outline">{agent.model}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {agent.description}
                  </p>
                </div>
              ))}
              {overflowAgentCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  +{overflowAgentCount} additional specialists remain available through the
                  coordinator handoff loop.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="workspace-eyebrow text-[10px]">Verification</p>
              <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                Live output quality and evidence
              </h4>
            </div>
            {agentSummary && useAgentSummaryPanel ? (
              <AgentStatePanel
                lastAgentName={agentSummary.lastAgentName ?? activeAgentLabel}
                plan={agentSummary.verificationSteps}
                confidence={agentSummary.confidence}
                missingEvidence={agentSummary.missingEvidence ?? []}
                verificationSteps={agentSummary.verificationSteps ?? []}
                evidenceCitations={agentSummary.evidenceCitations ?? []}
                toolsInvoked={agentSummary.toolsInvoked ?? []}
                packVersionsUsed={agentSummary.packVersionsUsed ?? []}
                proofChecks={agentSummary.proofChecks ?? []}
                retryAttempts={agentSummary.retryAttempts}
                retryMaxAttempts={agentSummary.retryMaxAttempts}
                retryMode={agentSummary.retryMode}
                fallbackLineage={agentSummary.fallbackLineage}
                fallbackReason={agentSummary.fallbackReason}
                toolFailureDetails={agentSummary.toolFailures}
                errorSummary={agentSummary.errorSummary ?? null}
              />
            ) : (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  The live verification panel fills in after the first response.
                </p>
                <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                  <p>Tool calls and approval prompts will show up in the thread as they happen.</p>
                  <p>Confidence, missing evidence, and proof checks will accumulate here.</p>
                  <p>Keep this lane open when you need to validate assumptions before actioning the result.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}