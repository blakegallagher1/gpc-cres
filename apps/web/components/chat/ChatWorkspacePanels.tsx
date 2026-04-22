'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Bot,
  Briefcase,
  Calculator,
  Calendar,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Layers,
  ListChecks,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Receipt,
  Route,
  Search,
  ShieldCheck,
  ShieldCheckIcon,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AgentStatePanel } from '@/components/agent-state/AgentStatePanel';
import { useAgents } from '@/lib/hooks/useAgents';
import { AgentTrustEnvelope, EvidenceCitation } from '@/types';
import {
  CHAT_WORKSPACE_CAPABILITIES,
  CHAT_WORKSPACE_STEPS,
} from './chatWorkspaceContent';
import { CuaModelToggle, type CuaModel } from './CuaModelToggle';
import { cn } from '@/lib/utils';

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

export function shouldAnimateChatWorkspaceHero({
  isHydrated,
  reduceMotion,
  isTest,
}: {
  isHydrated: boolean;
  reduceMotion: boolean;
  isTest: boolean;
}): boolean {
  return isHydrated && !reduceMotion && !isTest;
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

type QuickActionItem = {
  id: string;
  label: string;
  detail: string;
  icon: string;
  tone?: string;
};

const CHAT_QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'risk-screen', label: 'Run entitlement screen', detail: 'Pull the first-pass risk picture, gating issues, and a recommended workplan.', icon: 'verify', tone: 'highlight' },
  { id: 'zoning-brief', label: 'Summarize zoning + setbacks', detail: 'Turn the parcel facts into a concise operator brief with missing evidence called out.', icon: 'plan' },
  { id: 'diligence-checklist', label: 'Build diligence checklist', detail: 'Generate the next-step checklist, owners, and proof gaps for the team to execute.', icon: 'attach' },
  { id: 'capital-compare', label: 'Compare capital paths', detail: 'Frame debt, equity, and timing tradeoffs before the run turns into an investment memo.', icon: 'compare' },
];

const CHAT_QUICK_ACTION_PROMPTS: Record<string, string> = {
  'risk-screen': 'Screen this site for entitlement risk and give me the key gating issues, proof gaps, and next-step workplan.',
  'zoning-brief': 'Summarize the zoning, setbacks, and primary entitlement constraints for this site and call out the evidence still missing.',
  'diligence-checklist': 'Build the due diligence checklist for this opportunity with owners, evidence requests, and decision gates.',
  'capital-compare': 'Compare the debt and equity paths for this opportunity and outline the best next move with supporting rationale.',
};

/* ------------------------------------------------------------------ */
/*  Deal Stage Prompts                                                 */
/* ------------------------------------------------------------------ */

type DealStagePrompt = { label: string; prompt: string; icon: string };

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
      { label: 'Model exit scenarios', prompt: 'Model exit scenarios for this deal — hold, sell at stabilization, and 1031 exchange. Compare IRRs.', icon: 'trending-up' },
      { label: 'Prepare disposition brief', prompt: 'Generate a disposition analysis brief for this deal. Include market positioning and buyer targeting strategy.', icon: 'briefcase' },
      { label: 'Calculate depreciation', prompt: 'Calculate the depreciation schedule and cost segregation estimate for this deal\'s improvements.', icon: 'receipt' },
      { label: 'Check 1031 deadlines', prompt: 'Calculate 1031 exchange deadlines for this deal. Show identification and closing windows.', icon: 'calendar' },
    ];
  return [];
}

const DEAL_STAGE_ICON_MAP: Record<string, typeof FileText> = {
  shield: ShieldCheck, target: Target, book: BookOpen, search: Search,
  layers: Layers, calculator: Calculator, 'file-text': FileText, route: Route,
  'list-checks': ListChecks, 'bar-chart': BarChart3, 'shield-check': ShieldCheckIcon,
  flask: FlaskConical, 'trending-up': TrendingUp, briefcase: Briefcase,
  receipt: Receipt, calendar: Calendar,
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
  topStage: '—',
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
          deals?: { id: string; status?: string; parcels?: unknown[] }[];
        };
        if (cancelled) return;

        const deals = payload.deals ?? [];
        const activeDeals = deals.filter(
          (d) => d.status && !['KILLED', 'EXITED'].includes(d.status.toUpperCase()),
        ).length;
        const trackedParcels = deals.reduce(
          (sum, d) => sum + (Array.isArray(d.parcels) ? d.parcels.length : 0), 0,
        );
        const stageCounts: Record<string, number> = {};
        for (const d of deals) {
          const st = d.status ?? 'UNKNOWN';
          stageCounts[st] = (stageCounts[st] ?? 0) + 1;
        }
        const topStage = Object.entries(stageCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0]
          ?.replace(/_/g, ' ') ?? '—';

        setStats({
          activeDeals,
          trackedParcels: trackedParcels || activeDeals,
          topStage: topStage.charAt(0).toUpperCase() + topStage.slice(1).toLowerCase(),
          openTasks: 0,
        });
      } catch {
        if (!cancelled) setStats(EMPTY_PORTFOLIO_STATS);
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
/*  ChatWorkspaceHero                                                  */
/* ------------------------------------------------------------------ */

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
  const [isHydrated, setIsHydrated] = useState(false);
  const shouldAnimate = shouldAnimateChatWorkspaceHero({
    isHydrated,
    reduceMotion: Boolean(reduceMotion),
    isTest: process.env.NODE_ENV === 'test',
  });
  const motionProps = shouldAnimate
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: HERO_TRANSITION }
    : {};

  useEffect(() => { setIsHydrated(true); }, []);

  const dealStagePrompts = getDealStagePrompts(dealStatus);
  const dealStageName = getDealStageName(dealStatus);
  const hasDealPrompts = dealStagePrompts.length > 0;
  const { stats: portfolioStats, loading: portfolioLoading } = usePortfolioStats();
  const showPortfolioPulse = launchState && !hasDealPrompts;

  if (!launchState) {
    return (
      <motion.header
        className="border-b border-rule bg-paper-panel px-8 py-4 sm:px-10"
        {...motionProps}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="ed-eyebrow mb-0.5">{scopeLabel}</div>
            <p className="text-[14px] font-medium text-ink">{threadStatusLabel}</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-fade">
              {activeAgentLabel} · {transportLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden min-w-[12rem] md:block">{dealSelector}</div>
            {cuaModel && onCuaModelChange ? (
              <CuaModelToggle model={cuaModel} onModelChange={onCuaModelChange} />
            ) : null}
          </div>
        </div>
      </motion.header>
    );
  }

  return (
    <motion.div
      className="shrink-0 border-b border-rule bg-paper-panel px-8 py-6 sm:px-10 sm:py-8"
      {...motionProps}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="ed-eyebrow mb-0.5">Run desk</div>
            <p className="mt-1 text-[13px] text-ink-soft">
              Start with the brief. Add deal context or routing only when the run needs stronger control.
            </p>
          </div>
          {cuaModel && onCuaModelChange ? (
            <CuaModelToggle model={cuaModel} onModelChange={onCuaModelChange} />
          ) : null}
        </div>

        {showPortfolioPulse && (
          <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule sm:grid-cols-4">
            {[
              { k: 'Active deals', v: portfolioLoading ? '—' : String(portfolioStats.activeDeals) },
              { k: 'Tracked parcels', v: portfolioLoading ? '—' : String(portfolioStats.trackedParcels) },
              { k: 'Pipeline stage', v: portfolioLoading ? '—' : portfolioStats.topStage },
              { k: 'Open tasks', v: portfolioLoading ? '—' : String(portfolioStats.openTasks || '—') },
            ].map((s) => (
              <div key={s.k} className="bg-paper-panel px-3 py-2.5">
                <div className="ed-eyebrow">{s.k}</div>
                <div className="mt-0.5 text-[16px] font-semibold text-ink">{s.v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-5 flex items-center gap-3">
          <span className="text-[13px] font-medium text-ink">Client matter</span>
          <div className="min-w-0 flex-1">{dealSelector}</div>
        </div>

        <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em] text-ink">
          Ask anything.
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-[1.6] text-ink-soft">
          Name the matter, decision, memo, table, or next move you need back.
        </p>

        {hasDealPrompts ? (
          <div className="mt-6 space-y-2">
            <p className="ed-eyebrow">Suggested for {dealStageName}</p>
            <div className="flex flex-wrap gap-2">
              {dealStagePrompts.map((sp) => {
                const Icon = DEAL_STAGE_ICON_MAP[sp.icon] ?? FileText;
                return (
                  <Button
                    key={sp.label}
                    type="button"
                    variant="outline"
                    className="h-8 rounded border-rule px-3 text-[12px] font-medium text-ink hover:border-ink hover:bg-paper-soft"
                    onClick={() => onQuickActionSelect?.(sp.prompt)}
                  >
                    <Icon className="mr-1.5 h-3.5 w-3.5 text-ink-fade" />
                    {sp.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            {CHAT_QUICK_ACTIONS.slice(0, 2).map((action) => (
              <Button
                key={action.id}
                type="button"
                variant="outline"
                className="h-8 rounded border-rule px-3 text-[12px] font-medium text-ink hover:border-ink hover:bg-paper-soft"
                onClick={() => {
                  const prompt = CHAT_QUICK_ACTION_PROMPTS[action.id];
                  if (prompt) onQuickActionSelect?.(prompt);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatWorkspaceInspector                                             */
/* ------------------------------------------------------------------ */

type InspectorTabKey = 'evidence' | 'agents' | 'gates';

function InspectorTab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-2.5 text-[12.5px] text-ink-fade',
        'data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-none',
      )}
    >
      {children}
    </TabsTrigger>
  );
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-3.5">
      <p className="ed-eyebrow mb-2.5">{title}</p>
      {children}
    </section>
  );
}

function InspectorEvidenceTab({ citations, gaps }: { citations: EvidenceCitation[]; gaps: string[] }) {
  return (
    <div>
      <RailSection title={`Ledger · ${citations.length}`}>
        {citations.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">No evidence captured yet.</p>
        ) : (
          citations.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 border-b border-dashed border-rule-soft py-2 last:border-0">
              <span className="pt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-fade">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium leading-[1.35] text-ink">
                  {(c as Record<string, unknown>).label as string ?? (c as Record<string, unknown>).title as string ?? c.url ?? 'Evidence'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-fade">
                  via {c.tool ?? 'tool'}
                </div>
              </div>
              <span className="pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-fade">
                {(c as Record<string, unknown>).kind as string ?? 'Ref'}
              </span>
            </div>
          ))
        )}
      </RailSection>
      <RailSection title={`Proof gaps · ${gaps.length}`}>
        {gaps.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">No gaps flagged.</p>
        ) : (
          gaps.map((g, i) => (
            <div key={i} className="flex items-start gap-2.5 border-b border-dashed border-rule-soft py-2 last:border-0">
              <span className="text-[12px] font-bold leading-[1.4] text-ed-warn">◇</span>
              <span className="text-[12.5px] leading-[1.45] text-ink">{g}</span>
            </div>
          ))
        )}
      </RailSection>
    </div>
  );
}

function InspectorAgentsTab({ tools }: { tools: string[] }) {
  return (
    <div>
      <RailSection title={`Tools invoked · ${tools.length}`}>
        {tools.length === 0 ? (
          <p className="text-[12.5px] text-ink-soft">None yet.</p>
        ) : (
          <div className="flex flex-col">
            {tools.map((t) => (
              <div key={t} className="flex items-center justify-between border-b border-dashed border-rule-soft py-1.5 font-mono text-[11px] last:border-0">
                <span className="text-ink">{t}</span>
                <span className="text-ink-fade">ok</span>
              </div>
            ))}
          </div>
        )}
      </RailSection>
    </div>
  );
}

function InspectorGatesTab() {
  const gates = [
    { k: 'Intake', s: 'done' as const, d: '10 Apr' },
    { k: 'Triage', s: 'done' as const, d: '12 Apr' },
    { k: 'Screened', s: 'done' as const, d: '18 Apr' },
    { k: 'Pre-LOI', s: 'active' as const, d: 'Today' },
    { k: 'Under contract', s: 'pending' as const, d: '—' },
    { k: 'Entitled', s: 'pending' as const, d: '—' },
    { k: 'Closed', s: 'pending' as const, d: '—' },
  ];
  return (
    <div>
      <RailSection title="Deal gates">
        {gates.map((g, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-dashed border-rule-soft py-2 last:border-0">
            <div
              className={cn(
                'mt-1 h-2.5 w-2.5 rounded-full',
                g.s === 'done' && 'bg-ed-ok',
                g.s === 'active' && 'bg-ink shadow-[0_0_0_4px_oklch(var(--paper-inset))]',
                g.s === 'pending' && 'bg-rule',
              )}
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-medium text-ink">{g.k}</div>
              <div className="mt-0.5 font-mono text-[10.5px] text-ink-fade">
                {g.s === 'done' && `Complete · ${g.d}`}
                {g.s === 'active' && 'Current · human approval required'}
                {g.s === 'pending' && 'Pending'}
              </div>
            </div>
          </div>
        ))}
      </RailSection>
    </div>
  );
}

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
  const [tab, setTab] = useState<InspectorTabKey>('evidence');

  const inspectorContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Trust envelope hero */}
      <div className="px-5 py-4">
        {useAgentSummaryPanel && agentSummary ? (
          <AgentStatePanel
            lastAgentName={agentSummary.lastAgentName ?? activeAgentLabel}
            plan={agentSummary.plan}
            confidence={agentSummary.confidence}
            researchLane={agentSummary.researchLane}
            missingEvidence={agentSummary.missingEvidence}
            verificationSteps={agentSummary.verificationSteps}
            evidenceCitations={agentSummary.evidenceCitations}
            toolsInvoked={agentSummary.toolsInvoked}
            packVersionsUsed={agentSummary.packVersionsUsed}
            errorSummary={agentSummary.errorSummary}
          />
        ) : (
          <div className="rounded border border-rule bg-paper-soft px-4 py-5 text-center">
            <p className="ed-eyebrow mb-1">Trust Envelope</p>
            <p className="text-[12.5px] text-ink-soft">Dispatch a run to populate.</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTabKey)} className="flex flex-1 min-h-0 flex-col">
        <TabsList className="h-auto justify-start gap-0 rounded-none border-b border-rule bg-transparent px-3 p-0">
          <InspectorTab value="evidence">Evidence</InspectorTab>
          <InspectorTab value="agents">Agents</InspectorTab>
          <InspectorTab value="gates">Gates</InspectorTab>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="evidence" className="m-0">
            <InspectorEvidenceTab citations={agentSummary?.evidenceCitations ?? []} gaps={agentSummary?.missingEvidence ?? []} />
          </TabsContent>
          <TabsContent value="agents" className="m-0">
            <InspectorAgentsTab tools={agentSummary?.toolsInvoked ?? []} />
          </TabsContent>
          <TabsContent value="gates" className="m-0">
            <InspectorGatesTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );

  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="left-auto right-0 top-0 h-[100svh] max-h-[100svh] w-full max-w-[24rem] translate-x-0 translate-y-0 gap-0 rounded-none border-l border-rule bg-paper-panel p-0 sm:max-w-[24rem]">
          <DialogHeader className="border-b border-rule px-5 py-3 text-left">
            <DialogTitle className="text-[14px] font-semibold text-ink">
              Run inspector
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-5 text-ink-soft">
              Trust envelope, evidence, and active gates.
            </DialogDescription>
          </DialogHeader>
          {inspectorContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside className="hidden w-[360px] border-l border-rule bg-paper-panel lg:flex lg:flex-col">
      {inspectorContent}
    </aside>
  );
}
