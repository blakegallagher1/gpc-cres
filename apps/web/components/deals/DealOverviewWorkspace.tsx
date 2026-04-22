"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/deals/ActivityTimeline";
import { DeadlineBar } from "@/components/deals/DeadlineBar";
import { DealStakeholdersPanel } from "@/components/deals/DealStakeholdersPanel";
import { ExtractionStatusSummary } from "@/components/deals/DocumentExtractionReview";
import { GeneralizedScorecard } from "@/components/deals/GeneralizedScorecard";
import { RiskRegisterPanel } from "@/components/deals/RiskRegisterPanel";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { StatusBadge } from "@/components/deals/StatusBadge";
import { TriageIndicator } from "@/components/deals/TriageIndicator";
import { TriageResultPanel } from "@/components/deals/TriageResultPanel";
import type { TaskItem } from "@/components/deals/TaskCard";
import { WorkflowTimeline } from "@/components/deals/WorkflowTimeline";
import { ScreeningScorecard } from "@/components/maps/ScreeningScorecard";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type DealOverviewDeal = {
  id: string;
  name: string;
  sku: string;
  status: string;
  assetClass?: string | null;
  strategy?: string | null;
  workflowTemplateKey?: string | null;
  currentStageKey?: string | null;
  targetCloseDate?: string | null;
  triageTier?: string | null;
  workflowTemplate?: {
    name: string;
    stages: Array<{
      id: string;
      key: string;
      name: string;
      ordinal: number;
      description?: string | null;
      requiredGate?: string | null;
    }>;
  } | null;
  stageHistory: Array<{
    id: string;
    fromStageKey: string | null;
    toStageKey: string;
    changedAt: string;
    note?: string | null;
  }>;
  generalizedScorecards: Array<{
    id: string;
    module: string;
    dimension: string;
    score: number;
    weight: number | null;
    evidence: string | null;
    scoredAt: string;
  }>;
  jurisdiction?: { id: string; name: string; kind: string; state: string } | null;
  parcels: Array<{ id: string; propertyDbId?: string | null }>;
  tasks: TaskItem[];
  packContext?: {
    hasPack: boolean;
    isStale: boolean;
    stalenessDays: number | null;
    missingEvidence: string[];
  };
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DealTerms = {
  offerPrice: string | number | null;
  earnestMoney: string | number | null;
  closingDate: string | null;
  titleCompany: string | null;
  dueDiligenceDays: number | null;
  financingContingencyDays: number | null;
  loiSignedAt: string | null;
  psaSignedAt: string | null;
  titleReviewDue: string | null;
  surveyDue: string | null;
  environmentalDue: string | null;
  sellerContact: string | null;
  brokerContact: string | null;
} | null;

type DealEntitlementPath = {
  recommendedStrategy: string | null;
  preAppMeetingDate: string | null;
  applicationType: string | null;
  applicationSubmittedDate: string | null;
  applicationNumber: string | null;
  publicNoticeDate: string | null;
  publicNoticePeriodDays: number | null;
  hearingScheduledDate: string | null;
  hearingBody: string | null;
  decisionDate: string | null;
  decisionType: string | null;
  conditions: string[];
  appealDeadline: string | null;
  appealFiled: boolean | null;
  conditionComplianceStatus: string | null;
} | null;

type DealPropertyTitle = {
  titleInsuranceReceived: boolean | null;
  exceptions: string[];
  liens: string[];
  easements: string[];
} | null;

type DealPropertySurvey = {
  surveyCompletedDate: string | null;
  acreageConfirmed: string | number | null;
  encroachments: string[];
  setbacks: Record<string, unknown>;
} | null;

type TriageSource = { url: string; title?: string };

type SurfaceTone = "default" | "critical" | "positive";

type DetailRow = {
  label: string;
  value: ReactNode;
  tone?: SurfaceTone;
};

function formatCurrencyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numberValue)) {
    return "—";
  }

  return formatCurrency(numberValue);
}

function formatNumericValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numberValue)) {
    return "—";
  }

  return numberValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatDateValue(value: string | null | undefined): string {
  return value ? formatDate(value) : "—";
}

function formatAppealFiled(value: boolean | null): string {
  if (value === null) {
    return "—";
  }

  return value ? "Yes" : "No";
}

function formatTitleInsurance(value: boolean | null): string {
  if (value === null) {
    return "—";
  }

  return value ? "Received" : "Pending";
}

function formatSetbackSummary(setbacks: Record<string, unknown>): string {
  const entries = Object.entries(setbacks).filter(([, value]) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    return true;
  });

  if (entries.length === 0) {
    return "—";
  }

  return entries
    .map(([key, value]) => {
      const displayValue =
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
      return `${key}: ${displayValue}`;
    })
    .join(" · ");
}

function countOpenDeadlines(tasks: TaskItem[]): number {
  return tasks.filter((task) => task.dueAt && task.status !== "DONE" && task.status !== "CANCELED")
    .length;
}

function countUrgentDeadlines(tasks: TaskItem[]): number {
  const now = Date.now();

  return tasks.filter((task) => {
    if (!task.dueAt || task.status === "DONE" || task.status === "CANCELED") {
      return false;
    }

    const dueTime = new Date(task.dueAt).getTime();
    const hoursUntilDue = (dueTime - now) / 3_600_000;
    return hoursUntilDue <= 72;
  }).length;
}

function Surface({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-4 md:px-5">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <div>
            <h2 className="text-sm font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="px-4 py-4 md:px-5">{children}</div>
    </section>
  );
}

function DetailTable({ rows }: { rows: DetailRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border align-top last:border-b-0">
            <th className="w-[9.5rem] py-3 pr-4 text-left font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {row.label}
            </th>
            <td
              className={cn(
                "py-3 text-sm leading-6 text-foreground",
                row.tone === "critical" && "text-destructive",
                row.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InlineList({
  items,
  emptyLabel,
}: {
  items: string[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-foreground">
      {items.map((item) => (
        <li key={item} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Dense overview workspace for the deal detail route. */
export function DealOverviewWorkspace({
  deal,
  terms,
  entitlementPath,
  propertyTitle,
  propertySurvey,
  triageResult,
  triageSources,
  hasGeneralizedScorecards,
  displayNotes,
  onRunAction,
  onTaskCompleted,
}: {
  deal: DealOverviewDeal;
  terms: DealTerms;
  entitlementPath: DealEntitlementPath;
  propertyTitle: DealPropertyTitle;
  propertySurvey: DealPropertySurvey;
  triageResult: Record<string, unknown> | null;
  triageSources: TriageSource[];
  hasGeneralizedScorecards: boolean;
  displayNotes: string;
  onRunAction: NonNullable<Parameters<typeof TriageResultPanel>[0]["onRunAction"]>;
  onTaskCompleted: NonNullable<Parameters<typeof TriageResultPanel>[0]["onTaskCompleted"]>;
}) {
  const openDeadlines = countOpenDeadlines(deal.tasks);
  const urgentDeadlines = countUrgentDeadlines(deal.tasks);
  const screeningParcelId = deal.parcels.find((parcel) => parcel.propertyDbId)?.propertyDbId ?? null;
  const packMissingEvidence = deal.packContext?.missingEvidence ?? [];
  const acreageValue = formatNumericValue(propertySurvey?.acreageConfirmed);

  const summaryRows: DetailRow[] = [
    {
      label: "Status",
      value: <StatusBadge status={deal.status} />,
    },
    {
      label: "Product",
      value: <SkuBadge sku={deal.sku} />,
    },
    {
      label: "Triage",
      value: <TriageIndicator tier={deal.triageTier} showLabel />,
    },
    {
      label: "Jurisdiction",
      value: deal.jurisdiction ? `${deal.jurisdiction.name}, ${deal.jurisdiction.state}` : "—",
    },
    {
      label: "Current stage",
      value: deal.currentStageKey ?? "—",
    },
    {
      label: "Asset class",
      value: deal.assetClass ?? "—",
    },
    {
      label: "Strategy",
      value: deal.strategy ?? "—",
    },
    {
      label: "Workflow",
      value: deal.workflowTemplate?.name ?? deal.workflowTemplateKey ?? "—",
    },
    {
      label: "Extraction",
      value: <ExtractionStatusSummary dealId={deal.id} compact />,
    },
  ];

  const acquisitionRows: DetailRow[] = [
    {
      label: "Offer price",
      value: <span className="font-mono tabular-nums">{formatCurrencyValue(terms?.offerPrice)}</span>,
    },
    {
      label: "Earnest money",
      value: <span className="font-mono tabular-nums">{formatCurrencyValue(terms?.earnestMoney)}</span>,
    },
    {
      label: "Closing date",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.closingDate)}</span>,
    },
    {
      label: "Due diligence",
      value: terms?.dueDiligenceDays === null || terms?.dueDiligenceDays === undefined ? "—" : `${terms.dueDiligenceDays} days`,
    },
    {
      label: "Financing",
      value:
        terms?.financingContingencyDays === null || terms?.financingContingencyDays === undefined
          ? "—"
          : `${terms.financingContingencyDays} days`,
    },
    {
      label: "Title company",
      value: terms?.titleCompany ?? "—",
    },
    {
      label: "Title review due",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.titleReviewDue)}</span>,
    },
    {
      label: "Survey due",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.surveyDue)}</span>,
    },
    {
      label: "Environmental due",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.environmentalDue)}</span>,
    },
    {
      label: "LOI signed",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.loiSignedAt)}</span>,
    },
    {
      label: "PSA signed",
      value: <span className="font-mono tabular-nums">{formatDateValue(terms?.psaSignedAt)}</span>,
    },
    {
      label: "Seller contact",
      value: terms?.sellerContact ?? "—",
    },
    {
      label: "Broker contact",
      value: terms?.brokerContact ?? "—",
    },
  ];

  const timelineRows: DetailRow[] = [
    {
      label: "Created",
      value: <span className="font-mono tabular-nums">{formatDate(deal.createdAt)}</span>,
    },
    {
      label: "Last updated",
      value: <span className="font-mono tabular-nums">{formatDate(deal.updatedAt)}</span>,
    },
    {
      label: "Target close",
      value: <span className="font-mono tabular-nums">{formatDateValue(deal.targetCloseDate)}</span>,
    },
    {
      label: "Pre-app meeting",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.preAppMeetingDate)}</span>,
    },
    {
      label: "Application submitted",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.applicationSubmittedDate)}</span>,
    },
    {
      label: "Public notice",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.publicNoticeDate)}</span>,
    },
    {
      label: "Hearing",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.hearingScheduledDate)}</span>,
    },
    {
      label: "Decision",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.decisionDate)}</span>,
    },
    {
      label: "Appeal deadline",
      value: <span className="font-mono tabular-nums">{formatDateValue(entitlementPath?.appealDeadline)}</span>,
    },
  ];

  const entitlementRows: DetailRow[] = [
    {
      label: "Strategy",
      value: entitlementPath?.recommendedStrategy ?? "—",
    },
    {
      label: "Application type",
      value: entitlementPath?.applicationType ?? "—",
    },
    {
      label: "Application number",
      value: entitlementPath?.applicationNumber ?? "—",
    },
    {
      label: "Hearing body",
      value: entitlementPath?.hearingBody ?? "—",
    },
    {
      label: "Decision type",
      value: entitlementPath?.decisionType ?? "—",
    },
    {
      label: "Condition status",
      value: entitlementPath?.conditionComplianceStatus ?? "—",
    },
    {
      label: "Notice period",
      value:
        entitlementPath?.publicNoticePeriodDays === null ||
        entitlementPath?.publicNoticePeriodDays === undefined
          ? "—"
          : `${entitlementPath.publicNoticePeriodDays} days`,
    },
    {
      label: "Appeal filed",
      value: formatAppealFiled(entitlementPath?.appealFiled ?? null),
    },
    {
      label: "Conditions",
      value:
        entitlementPath && entitlementPath.conditions.length > 0 ? (
          <InlineList items={entitlementPath.conditions} emptyLabel="No conditions logged." />
        ) : (
          "No conditions logged."
        ),
    },
  ];

  const diligenceRows: DetailRow[] = [
    {
      label: "Pack health",
      value:
        deal.packContext == null ? (
          "No parish pack status available."
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                !deal.packContext.hasPack || deal.packContext.isStale ? "destructive" : "secondary"
              }
            >
              {!deal.packContext.hasPack
                ? "Missing"
                : deal.packContext.isStale
                  ? "Stale"
                  : "Current"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {!deal.packContext.hasPack
                ? "No parish pack linked yet."
                : deal.packContext.isStale
                  ? `${deal.packContext.stalenessDays ?? "?"} day stale`
                  : "Supporting pack is current."}
            </span>
          </div>
        ),
      tone:
        deal.packContext && (!deal.packContext.hasPack || deal.packContext.isStale)
          ? "critical"
          : "default",
    },
    {
      label: "Missing evidence",
      value: <InlineList items={packMissingEvidence} emptyLabel="No evidence gaps called out." />,
    },
    {
      label: "Title insurance",
      value: formatTitleInsurance(propertyTitle?.titleInsuranceReceived ?? null),
    },
    {
      label: "Survey completed",
      value: <span className="font-mono tabular-nums">{formatDateValue(propertySurvey?.surveyCompletedDate)}</span>,
    },
    {
      label: "Acreage",
      value: (
        <span className="font-mono tabular-nums">
          {acreageValue === "—" ? "—" : `${acreageValue} ac`}
        </span>
      ),
    },
    {
      label: "Setbacks",
      value: (
        <span className="font-mono text-[12px] leading-6 text-muted-foreground">
          {propertySurvey ? formatSetbackSummary(propertySurvey.setbacks) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.72fr)]">
      <div className="space-y-5">
        <Surface
          eyebrow="Core data"
          title="Underwriting ledger"
          description="Identity, acquisition terms, process dates, and entitlement posture in one scanning surface."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  File identity
                </p>
                <DetailTable rows={summaryRows} />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Acquisition
                </p>
                <DetailTable rows={acquisitionRows} />
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Timeline
                </p>
                <DetailTable rows={timelineRows} />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Entitlement
                </p>
                <DetailTable rows={entitlementRows} />
              </div>
            </div>
          </div>
        </Surface>

        <Surface
          eyebrow="Supporting analysis"
          title="Property diligence"
          description="Pack freshness, title constraints, and survey detail that can slow or reframe the file."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/deals/${deal.id}?tab=documents`}>Open documents</Link>
            </Button>
          }
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Diligence signal
              </p>
              <DetailTable rows={diligenceRows} />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Title exceptions
                </p>
                <InlineList
                  items={propertyTitle?.exceptions ?? []}
                  emptyLabel="No title exceptions logged."
                />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Liens
                </p>
                <InlineList items={propertyTitle?.liens ?? []} emptyLabel="No liens logged." />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Easements
                </p>
                <InlineList
                  items={propertyTitle?.easements ?? []}
                  emptyLabel="No easements logged."
                />
              </div>
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Encroachments
                </p>
                <InlineList
                  items={propertySurvey?.encroachments ?? []}
                  emptyLabel="No encroachments logged."
                />
              </div>
            </div>
          </div>
        </Surface>

        <Surface
          eyebrow="Decisioning"
          title={hasGeneralizedScorecards ? "Opportunity scorecard" : "Triage assessment"}
          description="The current underwriting recommendation and the next taskable actions for the file."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/deals/${deal.id}/financial-model`}>Open pro forma</Link>
            </Button>
          }
        >
          {hasGeneralizedScorecards ? (
            <GeneralizedScorecard scores={deal.generalizedScorecards} />
          ) : triageResult && (triageResult as Record<string, unknown>).decision ? (
            <TriageResultPanel
              triage={triageResult as Parameters<typeof TriageResultPanel>[0]["triage"]}
              sources={triageSources}
              dealId={deal.id}
              onRunAction={onRunAction}
              onTaskCompleted={onTaskCompleted}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No triage run yet. Use the header action to generate the first recommendation for this file.
            </p>
          )}
        </Surface>

        <Surface
          eyebrow="Execution"
          title="Workflow track"
          description="Stage history and current handoff status across the entitlement workflow."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/deals/${deal.id}?tab=tasks`}>Open tasks</Link>
            </Button>
          }
        >
          <WorkflowTimeline
            currentStageKey={deal.currentStageKey ?? null}
            workflowTemplate={deal.workflowTemplate ?? null}
            stageHistory={deal.stageHistory ?? []}
          />
        </Surface>

        {displayNotes ? (
          <Surface
            eyebrow="Operator notes"
            title="Notes"
            description="Freeform context that should stay attached to the underwriting file."
          >
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{displayNotes}</p>
          </Surface>
        ) : null}
      </div>

      <aside className="space-y-5">
        <Surface
          eyebrow="Watchlist"
          title="Live watchlist"
          description="What can block momentum in the next 72 hours."
          action={
            <Badge variant={urgentDeadlines > 0 ? "destructive" : "secondary"}>
              {openDeadlines} open
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={deal.status} />
              <SkuBadge sku={deal.sku} />
              <TriageIndicator tier={deal.triageTier} showLabel />
            </div>

            {deal.packContext ? (
              <div className="rounded-xl border border-border px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Pack status
                  </span>
                  <Badge
                    variant={
                      !deal.packContext.hasPack || deal.packContext.isStale
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {!deal.packContext.hasPack
                      ? "Missing"
                      : deal.packContext.isStale
                        ? "Stale"
                        : "Current"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {!deal.packContext.hasPack
                    ? "No parish pack is linked to this file yet."
                    : deal.packContext.isStale
                      ? `Refresh required. Pack is ${deal.packContext.stalenessDays ?? "?"} day(s) stale.`
                      : "Pack is current and available for review."}
                </p>
              </div>
            ) : null}

            {openDeadlines > 0 ? (
              <DeadlineBar tasks={deal.tasks} />
            ) : (
              <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No open dated tasks are attached to this file.
              </div>
            )}

            {screeningParcelId ? (
              <ScreeningScorecard parcelId={screeningParcelId} />
            ) : (
              <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Add a parcel with screening coverage to surface flood, soils, wetlands, and EPA flags here.
              </div>
            )}
          </div>
        </Surface>

        <DealStakeholdersPanel dealId={deal.id} />
        <RiskRegisterPanel dealId={deal.id} />

        <Surface
          eyebrow="Activity"
          title="Recent activity"
          description="The latest timeline events on the file."
        >
          <ActivityTimeline dealId={deal.id} />
        </Surface>
      </aside>
    </div>
  );
}
