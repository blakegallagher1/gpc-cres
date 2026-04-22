'use client';

import { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { getResearchLaneLabel, type ResearchLaneSelection } from '@/lib/agent/researchRouting';
import { EvidenceCitation } from '@/types';

export interface AgentStatePanelProps {
  lastAgentName?: string;
  plan?: string[];
  confidence?: number;
  researchLane?: ResearchLaneSelection;
  missingEvidence?: string[];
  verificationSteps?: string[];
  evidenceCitations?: EvidenceCitation[];
  toolsInvoked?: string[];
  packVersionsUsed?: string[];
  errorSummary?: string | null;
  toolFailureDetails?: string[];
  proofChecks?: string[];
  retryAttempts?: number;
  retryMaxAttempts?: number;
  retryMode?: string;
  fallbackLineage?: string[];
  fallbackReason?: string;
  retryCount?: number;
}

export function AgentStatePanel({
  lastAgentName = 'Coordinator',
  plan,
  confidence,
  researchLane,
  missingEvidence,
  verificationSteps,
  evidenceCitations,
  toolsInvoked,
  packVersionsUsed,
  errorSummary,
}: AgentStatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(Math.max(0, Math.min(1, confidence ?? 0)) * 100);
  const laneLabel = researchLane
    ? researchLane === 'auto' ? 'Auto' : getResearchLaneLabel(researchLane)
    : null;

  const evidenceCount = evidenceCitations?.length ?? 0;
  const gapCount = missingEvidence?.length ?? 0;
  const toolCount = toolsInvoked?.length ?? 0;

  return (
    <div className="rounded border border-rule bg-paper-panel ed-shadow-sm">
      <div className="border-b border-rule px-5 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="ed-eyebrow">Trust Envelope</span>
          <span className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
            {pct}%
          </span>
        </div>
        <div className="mb-3.5 h-[3px] rounded bg-paper-inset">
          <div className="h-full rounded bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Mini k="Evidence" v={`${evidenceCount} ref${evidenceCount === 1 ? '' : 's'}`} />
          <Mini k="Gaps"     v={String(gapCount)} />
          <Mini k="Tools"    v={String(toolCount)} />
        </div>
      </div>

      <div className="flex items-baseline justify-between px-5 pt-3">
        <div>
          <div className="ed-eyebrow">Last agent</div>
          <div className="mt-0.5 font-display text-[14px] font-semibold text-ink">{lastAgentName}</div>
        </div>
        {laneLabel && (
          <span className="rounded-full border border-rule bg-paper-soft px-2.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-soft">
            Lane · {laneLabel}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mx-5 mb-3.5 mt-2 text-[11px] font-medium text-ed-accent underline-offset-4 hover:underline"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3.5 border-t border-rule px-5 py-4">
          {plan && plan.length > 0 ? (
            <Section title="Plan">
              <ol className="m-0 space-y-1 p-0 text-[12.5px] leading-[1.5] text-ink">
                {plan.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="font-mono text-[10px] tracking-[0.1em] text-ink-fade">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <Separator className="bg-rule-soft" />

          {missingEvidence && missingEvidence.length > 0 ? (
            <Section title={`Missing evidence · ${missingEvidence.length}`}>
              <ul className="m-0 space-y-1.5 p-0 text-[12px] leading-[1.45] text-ink">
                {missingEvidence.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-ed-warn">◇</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {toolsInvoked && toolsInvoked.length > 0 ? (
            <Section title={`Tools · ${toolsInvoked.length}`}>
              <div className="flex flex-wrap gap-1.5">
                {toolsInvoked.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-rule-soft bg-paper-soft px-2 py-0.5 font-mono text-[10.5px] text-ink-soft"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}

          {verificationSteps && verificationSteps.length > 0 ? (
            <Section title="Verification">
              <ul className="m-0 space-y-1 p-0 text-[12px] text-ink-soft">
                {verificationSteps.map((v, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ed-ok">✓</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {packVersionsUsed && packVersionsUsed.length > 0 ? (
            <Section title="Pack versions">
              <div className="font-mono text-[10.5px] text-ink-fade">{packVersionsUsed.join(' · ')}</div>
            </Section>
          ) : null}

          {errorSummary ? (
            <div className="rounded border border-ed-warn/40 bg-[oklch(var(--ed-warn-soft))] p-3">
              <p className="ed-eyebrow mb-1 text-ed-warn">Error</p>
              <p className="m-0 text-[12px] leading-[1.45] text-ink">{errorSummary}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="ed-eyebrow">{k}</div>
      <div className="mt-0.5 text-[14px] font-semibold text-ink">{v}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="ed-eyebrow mb-2">{title}</p>
      {children}
    </div>
  );
}
