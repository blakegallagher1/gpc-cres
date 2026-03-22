'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentStatePanel } from '@/components/agent-state/AgentStatePanel';
import { useAgents } from '@/lib/hooks/useAgents';
import { AgentTrustEnvelope } from '@/types';
import {
  CHAT_WORKSPACE_CAPABILITIES,
  CHAT_WORKSPACE_STEPS,
} from './chatWorkspaceContent';

interface ChatWorkspaceHeroProps {
  activeAgentLabel: string;
  conversationCount: number;
  dealSelector: ReactNode;
  scopeLabel: string;
  threadStatusLabel: string;
  transportLabel: string;
  isMobile: boolean;
  onOpenHistory: () => void;
  onOpenInspector: () => void;
}

interface ChatWorkspaceInspectorProps {
  activeAgentLabel: string;
  agentSummary: AgentTrustEnvelope | null;
  attachmentStatusLabel: string;
  conversationCount: number;
  recentConversationLabel: string;
  threadStatusLabel: string;
  useAgentSummaryPanel: boolean;
  mobile?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const HERO_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as const,
};

function formatWorkspaceAgentLabel(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function InspectorVerificationPanel({
  activeAgentLabel,
  agentSummary,
  useAgentSummaryPanel,
}: {
  activeAgentLabel: string;
  agentSummary: AgentTrustEnvelope | null;
  useAgentSummaryPanel: boolean;
}) {
  if (agentSummary && useAgentSummaryPanel) {
    return (
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
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/72 px-4 py-4">
      <p className="text-sm font-medium text-foreground">
        Verification fills in after the first response.
      </p>
      <div className="space-y-2 text-xs leading-5 text-muted-foreground">
        <p>Confidence, evidence gaps, proof checks, and tool failures accumulate here.</p>
        <p>Use this lane before you approve tool actions or move a recommendation into execution.</p>
      </div>
    </div>
  );
}

function InspectorBody({
  activeAgentLabel,
  agentSummary,
  attachmentStatusLabel,
  conversationCount,
  recentConversationLabel,
  threadStatusLabel,
  useAgentSummaryPanel,
}: Omit<ChatWorkspaceInspectorProps, 'mobile' | 'open' | 'onOpenChange'>) {
  const { agents } = useAgents();
  const highlightedAgents = agents.slice(0, 6);
  const overflowAgentCount = Math.max(0, agents.length - highlightedAgents.length);
  const recommendedTab = agentSummary && useAgentSummaryPanel ? 'verification' : 'guide';
  const [activeTab, setActiveTab] = useState(recommendedTab);
  const [lastRecommendedTab, setLastRecommendedTab] = useState(recommendedTab);

  useEffect(() => {
    if (activeTab === lastRecommendedTab) {
      setActiveTab(recommendedTab);
    }
    setLastRecommendedTab(recommendedTab);
  }, [activeTab, lastRecommendedTab, recommendedTab]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 border-b border-border/60 pb-4 text-[11px]">
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="guide">Guide</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="guide" className="mt-0 space-y-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Run Brief</p>
                <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  What this desk expects
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">{conversationCount} saved</span>
            </div>
            <div className="space-y-3 border-t border-border/60 pt-3 text-sm leading-6">
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
            <div className="space-y-2 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
              {CHAT_WORKSPACE_CAPABILITIES.slice(0, 3).map((capability) => (
                <p key={capability.label}>
                  <span className="font-medium text-foreground">{capability.label}:</span>{' '}
                  {capability.detail}
                </p>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="verification" className="mt-0">
          <InspectorVerificationPanel
            activeAgentLabel={activeAgentLabel}
            agentSummary={agentSummary}
            useAgentSummaryPanel={useAgentSummaryPanel}
          />
        </TabsContent>

        <TabsContent value="coverage" className="mt-0 space-y-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="workspace-eyebrow text-[10px]">Specialist Coverage</p>
                <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                  Agents on this desk
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">{agents.length} loaded</span>
            </div>
            <div className="overflow-hidden border-y border-border/60">
              {highlightedAgents.map((agent, index) => (
                <div
                  key={agent.id}
                  className={index === highlightedAgents.length - 1 ? 'py-3' : 'border-b border-border/60 py-3'}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {formatWorkspaceAgentLabel(agent.name)}
                    </p>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {agent.model}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {agent.description}
                  </p>
                </div>
              ))}
            </div>
            {overflowAgentCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                +{overflowAgentCount} additional specialists remain available through the
                coordinator handoff loop.
              </p>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-border/60 pt-4">
            <div>
              <p className="workspace-eyebrow text-[10px]">Coverage Notes</p>
              <h4 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                What stays in thread
              </h4>
            </div>
            <div className="space-y-3 text-sm leading-6">
              {CHAT_WORKSPACE_CAPABILITIES.slice(2).map((capability) => (
                <div key={capability.label}>
                  <p className="font-medium text-foreground">{capability.label}</p>
                  <p className="text-muted-foreground">{capability.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Compact run brief for the primary chat workspace. */
export function ChatWorkspaceHero({
  activeAgentLabel,
  conversationCount,
  dealSelector,
  scopeLabel,
  threadStatusLabel,
  transportLabel,
  isMobile,
  onOpenHistory,
  onOpenInspector,
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
    <motion.section className="workspace-hero shrink-0 px-4 py-4 sm:px-6" {...motionProps}>
      <div className="workspace-hero-grid gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="workspace-eyebrow">Run Desk</p>
            <div className="space-y-2">
              <h2 className="workspace-title max-w-3xl text-[clamp(1.55rem,2.4vw,2.2rem)]">
                Set scope, ask for the deliverable, keep the run moving.
              </h2>
              <p className="workspace-subtitle max-w-2xl">
                The thread is the working surface. Keep scope, evidence, and approvals close
                as the run moves.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:max-w-sm xl:justify-end">
            {dealSelector}
            {isMobile ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={onOpenHistory}
                >
                  <PanelLeftOpen className="mr-2 h-4 w-4" />
                  History
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={onOpenInspector}
                >
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  Inspector
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 border-t border-border/60 pt-4 text-[11px] sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="workspace-stat-label">Scope</p>
            <p className="mt-1 text-sm font-medium text-foreground">{scopeLabel}</p>
          </div>
          <div>
            <p className="workspace-stat-label">Thread</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {threadStatusLabel} · {transportLabel}
            </p>
          </div>
          <div>
            <p className="workspace-stat-label">Agent</p>
            <p className="mt-1 text-sm font-medium text-foreground">{activeAgentLabel}</p>
          </div>
          <div>
            <p className="workspace-stat-label">History</p>
            <p className="mt-1 text-sm font-medium text-foreground">{conversationCount} saved</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** Right-rail inspector for execution guidance, coverage, and verification. */
export function ChatWorkspaceInspector({
  activeAgentLabel,
  agentSummary,
  attachmentStatusLabel,
  conversationCount,
  recentConversationLabel,
  threadStatusLabel,
  useAgentSummaryPanel,
  mobile = false,
  open = false,
  onOpenChange,
}: ChatWorkspaceInspectorProps) {
  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="left-auto right-0 top-0 h-[100svh] max-h-[100svh] w-full max-w-[24rem] translate-x-0 translate-y-0 gap-0 rounded-none border-l border-border/60 bg-background/96 p-0 sm:max-w-[24rem]">
          <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
              Live Execution
            </DialogTitle>
            <DialogDescription>
              Verification, specialist coverage, and thread state stay here while the run stays focused.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <InspectorBody
              activeAgentLabel={activeAgentLabel}
              agentSummary={agentSummary}
              attachmentStatusLabel={attachmentStatusLabel}
              conversationCount={conversationCount}
              recentConversationLabel={recentConversationLabel}
              threadStatusLabel={threadStatusLabel}
              useAgentSummaryPanel={useAgentSummaryPanel}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside className="hidden w-[22rem] border-l border-border/60 bg-background/72 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="border-b border-border/60 px-5 py-4">
        <p className="workspace-eyebrow text-[10px]">Live Execution</p>
        <h3 className="mt-1 text-sm font-semibold tracking-tight text-foreground">
          Verification and specialist coverage
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Keep the thread central and pull detail from this lane when the run needs a check.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <InspectorBody
          activeAgentLabel={activeAgentLabel}
          agentSummary={agentSummary}
          attachmentStatusLabel={attachmentStatusLabel}
          conversationCount={conversationCount}
          recentConversationLabel={recentConversationLabel}
          threadStatusLabel={threadStatusLabel}
          useAgentSummaryPanel={useAgentSummaryPanel}
        />
      </div>
    </aside>
  );
}
