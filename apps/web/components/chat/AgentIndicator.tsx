'use client';

import { cn } from '@/lib/utils';

const agentColors: Record<string, string> = {
  coordinator: 'bg-slate-500',
  legal: 'bg-amber-500',
  research: 'bg-blue-500',
  risk: 'bg-red-500',
  finance: 'bg-emerald-600',
  screener: 'bg-purple-500',
  'deal-screener': 'bg-purple-500',
  'due-diligence': 'bg-cyan-600',
  entitlements: 'bg-orange-500',
  'market-intel': 'bg-indigo-500',
  'tax-strategist': 'bg-teal-600',
  design: 'bg-pink-500',
  operations: 'bg-yellow-600',
  marketing: 'bg-rose-500',
};

const agentBorderColors: Record<string, string> = {
  coordinator: 'border-l-slate-500',
  legal: 'border-l-amber-500',
  research: 'border-l-blue-500',
  risk: 'border-l-red-500',
  finance: 'border-l-emerald-600',
  screener: 'border-l-purple-500',
  'deal-screener': 'border-l-purple-500',
  'due-diligence': 'border-l-cyan-600',
  entitlements: 'border-l-orange-500',
  'market-intel': 'border-l-indigo-500',
  'tax-strategist': 'border-l-teal-600',
  design: 'border-l-pink-500',
  operations: 'border-l-yellow-600',
  marketing: 'border-l-rose-500',
};

const agentRoles: Record<string, string> = {
  coordinator: 'Orchestrator',
  legal: 'Counsel',
  research: 'Evidence',
  risk: 'Gating',
  finance: 'Underwriting',
  screener: 'Triage',
  'deal-screener': 'Triage',
  'due-diligence': 'Checklists',
  entitlements: 'Approvals',
  'market-intel': 'Comps',
  'tax-strategist': 'Structure',
  design: 'Siteplan',
  operations: 'Execution',
  marketing: 'Outreach',
};

function normalizeAgentKey(agentName: string): string {
  return agentName.toLowerCase().replace(/\s+agent$/i, '').replace(/\s+/g, '-');
}
function getAgentColor(agentName: string): string {
  return agentColors[normalizeAgentKey(agentName)] ?? 'bg-slate-500';
}
function getAgentBorderColor(agentName: string): string {
  return agentBorderColors[normalizeAgentKey(agentName)] ?? 'border-l-slate-600';
}
function getAgentRole(agentName: string): string {
  return agentRoles[normalizeAgentKey(agentName)] ?? 'Specialist';
}
function formatAgentLabel(agentName: string): string {
  return agentName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface AgentIndicatorProps {
  agentName: string;
}

export function AgentIndicator({ agentName }: AgentIndicatorProps) {
  const swatch = getAgentColor(agentName);
  const label = formatAgentLabel(agentName);
  const role = getAgentRole(agentName);

  return (
    <div className="border-b border-rule bg-paper-soft px-5 py-3 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('h-2.5 w-2.5 shrink-0 ed-pulse', swatch)} style={{ borderRadius: 1 }} />
          <div className="min-w-0 flex items-baseline gap-3">
            <span className="font-display text-[13px] font-semibold text-ink">{label}</span>
            <span className="ed-eyebrow-tight">{role}</span>
          </div>
        </div>
        <span className="ed-eyebrow">Active Handoff</span>
      </div>
    </div>
  );
}

export { agentColors, agentBorderColors, getAgentColor, getAgentBorderColor, getAgentRole, formatAgentLabel, normalizeAgentKey };
