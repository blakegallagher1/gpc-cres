'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  Mic,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AgentStatePanel } from '@/components/agent-state/AgentStatePanel';
import { useAgents } from '@/lib/hooks/useAgents';
import { AgentTrustEnvelope } from '@/types';
import {
  CHAT_WORKSPACE_CAPABILITIES,
  CHAT_WORKSPACE_STEPS,
} from './chatWorkspaceContent';
import { CuaModelToggle, type CuaModel } from './CuaModelToggle';
import {
  ComposerSectionTitle,
  InlineStatusBadge,
  InspectorTabs,
  PageHeader,
  QuickActionsGrid,
  RunMetaPanel,
  type QuickActionItem,
} from './ChatWorkspacePrimitives';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ChatWorkspaceHeroProps {
  activeAgentLabel: string;
  conversationCount: number;
  cuaModel?: CuaModel;
  dealSelector: ReactNode;
  launchState: boolean;
  scopeLabel: string;
  threadStatusLabel: string;
  transportLabel: string;
  isMobile: boolean;
  onOpenHistory: () => void;
  onOpenInspector: () => void;
  onCuaModelChange?: (model: CuaModel) => void;
  onQuickActionSelect?: (prompt: string) => void;
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

const CHAT_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'risk-screen',
    label: 'Run entitlement screen',
    detail: 'Pull the first-pass risk picture, gating issues, and a recommended workplan.',
    icon: 'verify',
    tone: 'highlight',
  },
  {
    id: 'zoning-brief',
    label: 'Summarize zoning + setbacks',
    detail: 'Turn the parcel facts into a concise operator brief with missing evidence called out.',
    icon: 'plan',
  },
  {
    id: 'diligence-checklist',
    label: 'Build diligence checklist',
    detail: 'Generate the next-step checklist, owners, and proof gaps for the team to execute.',
    icon: 'attach',
  },
  {
    id: 'capital-compare',
    label: 'Compare capital paths',
    detail: 'Frame debt, equity, and timing tradeoffs before the run turns into an investment memo.',
    icon: 'compare',
  },
];

const CHAT_QUICK_ACTION_PROMPTS: Record<string, string> = {
  'risk-screen': 'Screen this site for entitlement risk and give me the key gating issues, proof gaps, and next-step workplan.',
  'zoning-brief': 'Summarize the zoning, setbacks, and primary entitlement constraints for this site and call out the evidence still missing.',
  'diligence-checklist': 'Build the due diligence checklist for this opportunity with owners, evidence requests, and decision gates.',
  'capital-compare': 'Compare the debt and equity paths for this opportunity and outline the best next move with supporting rationale.',
};

const CHAT_SOURCE_CHIPS = [
  {
    id: 'vault',
    label: 'Vault',
    icon: FolderOpen,
    prompt:
      'Pull the relevant files from the current workspace and use them as source material before you answer.',
  },
  {
    id: 'web',
    label: 'Web research',
    icon: Globe,
    prompt:
      'Search the web for current context, cite the strongest sources, and fold that into the run.',
  },
  {
    id: 'evidence',
    label: 'Evidence pack',
    icon: ShieldCheck,
    prompt:
      'Build the answer with verification first, call out proof gaps, and keep the evidence pack attached.',
  },
  {
    id: 'prompt',
    label: 'Prompt library',
    icon: Sparkles,
    prompt:
      'Show me the strongest prompt pattern for this task, then run it with the current scope.',
  },
];

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
    <div className="space-y-5">
      <div className="rounded-[24px] border border-border/60 bg-background/90 p-4 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
        <ComposerSectionTitle
          title="Execution inspector"
          detail="Verification, proof status, and specialist coverage stay attached to the run."
          trailing={<InlineStatusBadge icon={<Bot className="h-3.5 w-3.5 text-muted-foreground" />} label={`${conversationCount} saved runs`} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Thread</span>
          <span className="text-xs font-medium text-foreground">{threadStatusLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Agent</span>
          <span className="text-xs font-medium text-foreground">{activeAgentLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">Attach</span>
          <span className="text-xs font-medium text-foreground">{attachmentStatusLabel}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="workspace-stat-label">History</span>
          <span className="text-xs font-medium text-foreground">{recentConversationLabel}</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <InspectorTabs value={activeTab} onValueChange={setActiveTab} />

        <TabsContent value="guide" className="mt-0 rounded-[24px] border border-border/60 bg-background/90 p-4 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
          <div className="space-y-2.5 text-sm leading-6">
            {CHAT_WORKSPACE_STEPS.map((step, index) => (
              <div key={step.title} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/[0.45] text-[9px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-foreground">{step.title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 border-t border-border/50 pt-4 text-[11px] leading-5 text-muted-foreground">
            {CHAT_WORKSPACE_CAPABILITIES.slice(0, 3).map((capability) => (
              <p key={capability.label}>
                <span className="text-foreground/80">{capability.label}</span>{' '}
                {capability.detail}
              </p>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="verification" className="mt-0 rounded-[24px] border border-border/60 bg-background/90 p-4 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
          <InspectorVerificationPanel
            activeAgentLabel={activeAgentLabel}
            agentSummary={agentSummary}
            useAgentSummaryPanel={useAgentSummaryPanel}
          />
        </TabsContent>

        <TabsContent value="coverage" className="mt-0 space-y-4 rounded-[24px] border border-border/60 bg-background/90 p-4 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)]">
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
          <div className="space-y-1.5 border-t border-border/50 pt-4 text-[11px] leading-5 text-muted-foreground">
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
  cuaModel,
  dealSelector,
  launchState,
  scopeLabel,
  threadStatusLabel,
  transportLabel,
  onCuaModelChange,
  onQuickActionSelect,
}: ChatWorkspaceHeroProps) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion || process.env.NODE_ENV === 'test'
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: HERO_TRANSITION,
      };
  const compactQuickActions = CHAT_QUICK_ACTIONS.slice(0, 2);

  return (
    <motion.div
      className="shrink-0 border-b border-border px-4 py-4 sm:px-5"
      {...motionProps}
    >
      {launchState ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-6 sm:py-10">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {compactQuickActions.map((action) => {
              const Icon = action.id === 'risk-screen' ? FileText : Table2;
              return (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg px-4 text-sm font-medium"
                  onClick={() => {
                    const prompt = CHAT_QUICK_ACTION_PROMPTS[action.id];
                    if (prompt) {
                      onQuickActionSelect?.(prompt);
                    }
                  }}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {action.id === 'risk-screen' ? 'Draft memo' : 'Review table'}
                </Button>
              );
            })}
          </div>

          <div className="rounded-lg border border-border bg-background p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-medium text-foreground">Client matter</span>
                <div className="min-w-0 flex-1">{dealSelector}</div>
              </div>
              {cuaModel && onCuaModelChange ? (
                <CuaModelToggle model={cuaModel} onModelChange={onCuaModelChange} />
              ) : null}
            </div>

            <div className="mt-8 space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                Ask Harvey anything.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Lead with the matter, outcome, or document you need. Type{' '}
                <span className="font-medium text-foreground">@</span> to attach sources and move straight into the answer.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <button
                type="button"
                className="inline-flex items-center gap-2 font-medium transition hover:text-foreground"
              >
                <FolderOpen className="h-4 w-4" />
                Files
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 font-medium transition hover:text-foreground"
              >
                <ShieldCheck className="h-4 w-4" />
                Sources
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 font-medium transition hover:text-foreground"
              >
                <Sparkles className="h-4 w-4" />
                Prompt library
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{scopeLabel}</p>
            <p className="text-xs text-muted-foreground">
              {threadStatusLabel} · {activeAgentLabel} · {transportLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden min-w-[12rem] md:block">{dealSelector}</div>
            {cuaModel && onCuaModelChange ? (
              <CuaModelToggle model={cuaModel} onModelChange={onCuaModelChange} />
            ) : null}
          </div>
        </div>
      )}
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
        <DialogContent className="left-auto right-0 top-0 h-[100svh] max-h-[100svh] w-full max-w-[24rem] translate-x-0 translate-y-0 gap-0 rounded-none border-l border-border/40 bg-background p-0 sm:max-w-[24rem]">
          <DialogHeader className="border-b border-border/40 px-4 py-3 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
              Run inspector
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Proof state, specialist coverage, and active gaps.
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
    <aside className="hidden w-[23.5rem] border-l border-border/40 bg-muted/[0.18] px-4 py-4 lg:flex lg:flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
