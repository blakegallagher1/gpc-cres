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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HERO_TRANSITION = {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1] as const,
};

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function formatWorkspaceAgentLabel(name: string): string {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Inspector internals                                                */
/* ------------------------------------------------------------------ */

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
    <div className="py-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        Verification fills in after the first response.
      </p>
      <p className="mt-2 text-xs leading-5">
        Confidence, evidence gaps, proof checks, and tool failures accumulate here.
      </p>
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
    <div className="space-y-4">
      {/* Compact status strip */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Thread</span>
          <span className="text-xs text-foreground">{threadStatusLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Agent</span>
          <span className="text-xs text-foreground">{activeAgentLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Attach</span>
          <span className="text-xs text-foreground">{attachmentStatusLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">History</span>
          <span className="text-xs text-foreground">{recentConversationLabel}</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="guide">Guide</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="guide" className="mt-0 space-y-3">
          <div className="space-y-2 text-sm leading-6">
            {CHAT_WORKSPACE_STEPS.map((step, index) => (
              <div key={step.title} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-border/60 text-[9px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-border/40 pt-3 text-[11px] leading-5 text-muted-foreground">
            {CHAT_WORKSPACE_CAPABILITIES.slice(0, 3).map((capability) => (
              <p key={capability.label}>
                <span className="text-foreground/80">{capability.label}</span>{' '}
                {capability.detail}
              </p>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="verification" className="mt-0">
          <InspectorVerificationPanel
            activeAgentLabel={activeAgentLabel}
            agentSummary={agentSummary}
            useAgentSummaryPanel={useAgentSummaryPanel}
          />
        </TabsContent>

        <TabsContent value="coverage" className="mt-0 space-y-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="workspace-stat-label">Specialists</span>
            <span className="text-muted-foreground">{agents.length} loaded</span>
          </div>
          <div className="space-y-0 divide-y divide-border/40">
            {highlightedAgents.map((agent) => (
              <div key={agent.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    {formatWorkspaceAgentLabel(agent.name)}
                  </p>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                    {agent.model}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {agent.description}
                </p>
              </div>
            ))}
          </div>
          {overflowAgentCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              +{overflowAgentCount} more via coordinator handoff.
            </p>
          ) : null}
          <div className="space-y-1.5 border-t border-border/40 pt-3 text-[11px] leading-5 text-muted-foreground">
            {CHAT_WORKSPACE_CAPABILITIES.slice(2).map((capability) => (
              <p key={capability.label}>
                <span className="text-foreground/80">{capability.label}:</span>{' '}
                {capability.detail}
              </p>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatWorkspaceHero                                                  */
/* ------------------------------------------------------------------ */

/** Compact status strip — replaces the old card-heavy hero. */
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
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: HERO_TRANSITION,
      };

  return (
    <motion.div
      className="shrink-0 border-b border-border/40 px-4 py-2.5 sm:px-5"
      {...motionProps}
    >
      <div className="flex items-center gap-3">
        {/* Status metadata — inline */}
        <div className="hidden min-w-0 flex-1 items-center gap-4 text-[11px] text-muted-foreground md:flex">
          <span>
            <span className="workspace-stat-label mr-1.5">Scope</span>
            <span className="text-foreground/90">{scopeLabel}</span>
          </span>
          <span className="text-border/60">|</span>
          <span>
            <span className="workspace-stat-label mr-1.5">Thread</span>
            <span className="text-foreground/90">{threadStatusLabel}</span>
            <span className="ml-1 text-muted-foreground/50">· {transportLabel}</span>
          </span>
          <span className="text-border/60">|</span>
          <span>
            <span className="workspace-stat-label mr-1.5">Agent</span>
            <span className="text-foreground/90">{activeAgentLabel}</span>
          </span>
          <span className="text-border/60">|</span>
          <span>
            <span className="workspace-stat-label mr-1.5">Runs</span>
            <span className="text-foreground/90">{conversationCount}</span>
          </span>
        </div>

        {/* Mobile: show condensed info */}
        <div className="min-w-0 flex-1 text-xs text-muted-foreground md:hidden">
          <span className="text-foreground/90">{activeAgentLabel}</span>
          <span className="mx-1.5 text-border/60">·</span>
          <span>{threadStatusLabel}</span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {dealSelector}
          {isMobile ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onOpenHistory}
              >
                <PanelLeftOpen className="mr-1.5 h-3.5 w-3.5" />
                History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onOpenInspector}
              >
                <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" />
                Inspector
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatWorkspaceInspector                                             */
/* ------------------------------------------------------------------ */

/** Right-rail inspector — verification, coverage, guide. */
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
        <DialogContent className="left-auto right-0 top-0 h-[100svh] max-h-[100svh] w-full max-w-[22rem] translate-x-0 translate-y-0 gap-0 rounded-none border-l border-border/40 bg-background p-0 sm:max-w-[22rem]">
          <DialogHeader className="border-b border-border/40 px-4 py-3 text-left">
            <DialogTitle className="text-xs font-semibold tracking-tight text-foreground">
              Live Execution
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Verification and specialist coverage.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
    <aside className="hidden w-[19rem] border-l border-border/40 bg-background lg:flex lg:flex-col">
      <div className="border-b border-border/40 px-4 py-3">
        <p className="workspace-eyebrow text-[10px]">Live Execution</p>
        <h3 className="mt-0.5 text-xs font-semibold tracking-tight text-foreground">
          Verification and specialist coverage
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
