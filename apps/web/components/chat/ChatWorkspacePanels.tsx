'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Bot,
  Briefcase,
  Calculator,
  Calendar,
  ChevronDown,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Layers,
  ListChecks,
  Mic,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Receipt,
  Route,
  Search,
  ShieldCheck,
  ShieldCheckIcon,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  TrendingUp,
  BookOpen,
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
  dealStatus?: string | null;
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
/*  Deal Stage Prompts                                                 */
/* ------------------------------------------------------------------ */

type DealStagePrompt = {
  label: string;
  prompt: string;
  icon: string;
};

function getDealStagePrompts(status: string | null | undefined): DealStagePrompt[] {
  const s = (status ?? '').toUpperCase();

  if (s.includes('TRIAGE') || s.includes('INTAKE'))
    return [
      { label: 'Run full screening', prompt: 'Run a full environmental and zoning screening for this deal\'s parcels. Include flood, soils, wetlands, EPA, and traffic analysis.', icon: 'shield' },
      { label: 'Score this deal', prompt: 'Run parcel triage scoring and hard filter checks. Give me a go/no-go recommendation with the key risk factors.', icon: 'target' },
      { label: 'Pull jurisdiction pack', prompt: 'Get the jurisdiction pack for this deal\'s location. I need setbacks, permitted uses, and conditional use requirements.', icon: 'book' },
      { label: 'Find comparable sales', prompt: 'Search for comparable sales near this deal\'s parcels. Focus on similar zoning and acreage within the last 24 months.', icon: 'search' },
    ];

  if (s.includes('PRE_LOI') || s.includes('NEGOTIATION'))
    return [
      { label: 'Model capital stack', prompt: 'Model the capital stack for this deal. Include senior debt, mezzanine, and equity layers with current market rates.', icon: 'layers' },
      { label: 'Run proforma', prompt: 'Calculate a development proforma for this deal. Include land cost, hard costs, soft costs, and projected NOI.', icon: 'calculator' },
      { label: 'Draft LOI terms', prompt: 'Generate an LOI artifact with standard terms for this deal. Include price, due diligence period, and closing timeline.', icon: 'file-text' },
      { label: 'Assess entitlement path', prompt: 'Predict the entitlement path for this deal. What approvals are needed and what\'s the likely timeline?', icon: 'route' },
    ];

  if (s.includes('UNDER_CONTRACT') || s.includes('DUE_DILIGENCE'))
    return [
      { label: 'Generate DD checklist', prompt: 'Generate a comprehensive due diligence checklist for this deal. Prioritize items by closing timeline risk.', icon: 'list-checks' },
      { label: 'Run underwriting', prompt: 'Run full underwriting analysis for this deal. Include debt sizing, returns analysis, and stress test scenarios.', icon: 'bar-chart' },
      { label: 'Review title commitment', prompt: 'Analyze the title commitment for this deal. Flag any exceptions, easements, or encumbrances that affect development.', icon: 'shield-check' },
      { label: 'Estimate Phase II scope', prompt: 'Estimate the Phase II environmental scope for this deal based on screening results and site history.', icon: 'flask' },
    ];

  if (s.includes('ENTITLED') || s.includes('CLOSING'))
    return [
      { label: 'Model exit scenarios', prompt: 'Model exit scenarios for this deal \u2014 hold, sell at stabilization, and 1031 exchange. Compare IRRs.', icon: 'trending-up' },
      { label: 'Prepare disposition brief', prompt: 'Generate a disposition analysis brief for this deal. Include market positioning and buyer targeting strategy.', icon: 'briefcase' },
      { label: 'Calculate depreciation', prompt: 'Calculate the depreciation schedule and cost segregation estimate for this deal\'s improvements.', icon: 'receipt' },
      { label: 'Check 1031 deadlines', prompt: 'Calculate 1031 exchange deadlines for this deal. Show identification and closing windows.', icon: 'calendar' },
    ];

  return [];
}

const DEAL_STAGE_ICON_MAP: Record<string, typeof FileText> = {
  shield: ShieldCheck,
  target: Target,
  book: BookOpen,
  search: Search,
  layers: Layers,
  calculator: Calculator,
  'file-text': FileText,
  route: Route,
  'list-checks': ListChecks,
  'bar-chart': BarChart3,
  'shield-check': ShieldCheckIcon,
  flask: FlaskConical,
  'trending-up': TrendingUp,
  briefcase: Briefcase,
  receipt: Receipt,
  calendar: Calendar,
};

function getDealStageName(status: string | null | undefined): string {
  const s = (status ?? '').toUpperCase();
  if (s.includes('TRIAGE') || s.includes('INTAKE')) return 'Triage';
  if (s.includes('PRE_LOI') || s.includes('NEGOTIATION')) return 'Pre-LOI';
  if (s.includes('UNDER_CONTRACT') || s.includes('DUE_DILIGENCE')) return 'Due Diligence';
  if (s.includes('ENTITLED') || s.includes('CLOSING')) return 'Closing';
  return '';
}

/* ------------------------------------------------------------------ */
/*  Portfolio Stats                                                    */
/* ------------------------------------------------------------------ */

type PortfolioStats = {
  activeDeals: number;
  trackedParcels: number;
  topStage: string;
  openTasks: number;
};

const EMPTY_PORTFOLIO_STATS: PortfolioStats = {
  activeDeals: 0,
  trackedParcels: 0,
  topStage: '\u2014',
  openTasks: 0,
};

function usePortfolioStats(): { stats: PortfolioStats; loading: boolean } {
  const [stats, setStats] = useState<PortfolioStats>(EMPTY_PORTFOLIO_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/deals?limit=200');
        if (!res.ok) throw new Error('fetch failed');
        const payload = (await res.json()) as {
          deals?: {
            id: string;
            status?: string;
            parcels?: unknown[];
          }[];
        };

        if (cancelled) return;

        const deals = payload.deals ?? [];
        const activeDeals = deals.filter(
          (d) => d.status && !['KILLED', 'EXITED'].includes(d.status.toUpperCase()),
        ).length;

        const trackedParcels = deals.reduce(
          (sum, d) => sum + (Array.isArray(d.parcels) ? d.parcels.length : 0),
          0,
        );

        // Find most common stage
        const stageCounts: Record<string, number> = {};
        for (const d of deals) {
          const st = d.status ?? 'UNKNOWN';
          stageCounts[st] = (stageCounts[st] ?? 0) + 1;
        }
        const topStage = Object.entries(stageCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0]
          ?.replace(/_/g, ' ') ?? '\u2014';

        setStats({
          activeDeals,
          trackedParcels: trackedParcels || activeDeals, // fallback to deal count if parcels not in response
          topStage: topStage.charAt(0).toUpperCase() + topStage.slice(1).toLowerCase(),
          openTasks: 0, // tasks not available from deals endpoint
        });
      } catch {
        if (!cancelled) {
          setStats({
            activeDeals: 0,
            trackedParcels: 0,
            topStage: '\u2014',
            openTasks: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}

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
  dealStatus,
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

  // Feature 9: Deal stage prompts
  const dealStagePrompts = getDealStagePrompts(dealStatus);
  const dealStageName = getDealStageName(dealStatus);
  const hasDealPrompts = dealStagePrompts.length > 0;

  // Feature 14: Portfolio stats (only fetch when in launch state with no deal)
  const { stats: portfolioStats, loading: portfolioLoading } = usePortfolioStats();
  const showPortfolioPulse = launchState && !hasDealPrompts;

  return (
    <motion.div
      className="shrink-0 border-b border-border px-4 py-4 sm:px-5"
      {...motionProps}
    >
      {launchState ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-6 sm:py-10">
          {/* Portfolio Pulse - shown when no deal selected */}
          {showPortfolioPulse ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Active Deals</p>
                <p className="text-lg font-semibold">{portfolioLoading ? '\u2014' : portfolioStats.activeDeals}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Tracked Parcels</p>
                <p className="text-lg font-semibold">{portfolioLoading ? '\u2014' : portfolioStats.trackedParcels}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Pipeline Stage</p>
                <p className="text-lg font-semibold">{portfolioLoading ? '\u2014' : portfolioStats.topStage}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Open Tasks</p>
                <p className="text-lg font-semibold">{portfolioLoading ? '\u2014' : portfolioStats.openTasks || '\u2014'}</p>
              </div>
            </div>
          ) : null}

          {/* Deal stage prompts OR default quick actions */}
          {hasDealPrompts ? (
            <div className="space-y-2">
              <p className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Suggested for {dealStageName}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {dealStagePrompts.map((sp) => {
                  const Icon = DEAL_STAGE_ICON_MAP[sp.icon] ?? FileText;
                  return (
                    <Button
                      key={sp.label}
                      type="button"
                      variant="outline"
                      className="h-10 rounded-lg px-4 text-sm font-medium"
                      onClick={() => onQuickActionSelect?.(sp.prompt)}
                    >
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {sp.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
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
          )}

          <div className="rounded-lg border border-border/70 bg-background p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-medium text-foreground">Matter scope</span>
                <div className="min-w-0 flex-1">{dealSelector}</div>
              </div>
              {cuaModel && onCuaModelChange ? (
                <CuaModelToggle model={cuaModel} onModelChange={onCuaModelChange} />
              ) : null}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
              <div className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Operator Run Desk
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                  Frame the matter. Define the output.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Start with the matter, target deliverable, and governing constraints. Type{' '}
                  <span className="font-medium text-foreground">@</span> to attach evidence before the run starts.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Workspace Mode
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Context</span>
                    <span className="font-medium text-foreground">Stateful</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Tools</span>
                    <span className="font-medium text-foreground">Agentic</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Inputs</span>
                    <span className="font-medium text-foreground">@ Evidence</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5">
                <Globe className="h-3.5 w-3.5" />
                Stateful run context
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5">
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                Tool-enabled execution
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Evidence and source attachments
              </span>
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
