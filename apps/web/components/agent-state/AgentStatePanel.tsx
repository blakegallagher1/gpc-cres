'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EvidenceCitation } from '@/types';

export interface AgentStatePanelProps {
  lastAgentName?: string;
  plan?: string[];
  confidence?: number;
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
  missingEvidence,
  verificationSteps,
  evidenceCitations,
  toolsInvoked,
  packVersionsUsed,
  errorSummary,
  toolFailureDetails,
  proofChecks,
  retryAttempts,
  retryMaxAttempts,
  retryMode,
  fallbackLineage,
  fallbackReason,
  retryCount,
}: AgentStatePanelProps) {
  const normalizedConfidence = Math.max(0, Math.min(1, confidence ?? 0));
  const confidencePercent = Math.round(normalizedConfidence * 100);

  const citationGroups = new Map<
    string,
    { count: number; sample?: string }
  >();
  evidenceCitations?.forEach((citation) => {
    const key = citation.tool || 'tool';
    const existing = citationGroups.get(key) ?? { count: 0 };
    existing.count += 1;
    if (!existing.sample && citation.url) {
      existing.sample = citation.url;
    }
    citationGroups.set(key, existing);
  });

  return (
    <div className="space-y-4 rounded-2xl border border-muted/30 bg-card/60 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Agent state
          </p>
          <h3 className="text-base font-semibold">{lastAgentName}</h3>
        </div>
        <div className="w-32 text-right">
          <p className="text-xs text-muted-foreground">Confidence</p>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {confidencePercent}%
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      </div>

      {plan && plan.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Plan preview
          </p>
          <ol className="mt-2 space-y-1 pl-4 text-xs leading-relaxed text-foreground">
            {plan.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No plan was captured for this turn.
        </p>
      )}

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Missing evidence
          </p>
          {missingEvidence && missingEvidence.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-foreground">
              {missingEvidence.map((item) => (
                <li key={item} className="flex items-start gap-1">
                  <span className="text-muted-foreground">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Evidence requirements appear satisfied.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Verification steps
          </p>
          {verificationSteps && verificationSteps.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground">
              {verificationSteps.map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No additional verification guidance.
            </p>
          )}
        </div>
      </div>

      <Separator />

      {(proofChecks !== undefined || retryAttempts !== undefined || retryMode || fallbackLineage || fallbackReason) && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {proofChecks && proofChecks.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proof checks
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground">
                  {proofChecks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div />
            )}
            {(retryAttempts !== undefined || retryMode || retryMaxAttempts !== undefined) && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Retry policy
                </p>
                <div className="mt-2 text-xs text-foreground">
                  <div>
                    Attempts: {typeof retryAttempts === "number" ? retryAttempts : 0}
                    {typeof retryMaxAttempts === "number"
                      ? ` / ${retryMaxAttempts}`
                      : ""}
                  </div>
                  <div>Mode: {retryMode ?? "default"}</div>
                </div>
              </div>
            )}
          </div>
          {(fallbackLineage || fallbackReason) && (
            <div className="space-y-2">
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fallback lineage
                </p>
                {fallbackLineage && fallbackLineage.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-xs text-foreground">
                    {fallbackLineage.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No fallback lineage recorded.</p>
                )}
              </div>
              {fallbackReason && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fallback reason
                  </p>
                  <p className="text-xs text-foreground">{fallbackReason}</p>
                </div>
              )}
            </div>
          )}
          <Separator />
        </>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tool activity
        </p>
        <div className="flex flex-wrap gap-2">
          {toolsInvoked && toolsInvoked.length > 0 ? (
            toolsInvoked.map((tool) => (
              <Badge key={tool} variant="outline">
                {tool}
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              No tool calls were recorded.
            </p>
          )}
        </div>
        {packVersionsUsed && packVersionsUsed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Packs used: {packVersionsUsed.join(', ')}
          </p>
        )}
      </div>

      {citationGroups.size > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence citations
            </p>
            <div className="mt-2 space-y-1">
              {Array.from(citationGroups.entries()).map(([tool, { count, sample }]) => (
                <div key={tool} className="flex flex-col gap-0.5 text-xs text-foreground">
                  <span className="font-medium text-foreground">{tool}</span>
                  <span className="text-muted-foreground">
                    {count} citation{count !== 1 ? 's' : ''} {sample ? `• ${sample}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(errorSummary || (toolFailureDetails && toolFailureDetails.length > 0)) && (
        <>
          <Separator />
          <div className="space-y-2 text-xs">
            {errorSummary && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Error summary
                </p>
                <p className="text-foreground">{errorSummary}</p>
              </div>
            )}

            {toolFailureDetails && toolFailureDetails.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tool failures
                </p>
                <ul className="mt-1 space-y-1 text-foreground">
                  {toolFailureDetails.map((failure) => (
                    <li key={failure}>• {failure}</li>
                  ))}
                </ul>
              </div>
            )}

            {retryCount !== undefined && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Retry attempts
                </p>
                <p className="text-foreground">{retryCount || 0}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
