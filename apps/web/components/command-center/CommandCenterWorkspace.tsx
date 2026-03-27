"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Download, Radar, RefreshCw, Sparkles } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionErrorBoundary } from "@/components/error-boundary/ErrorBoundary";
import { EntitlementKpiWidget } from "@/components/intelligence/EntitlementKpiWidget";
import { cn } from "@/lib/utils";
import { buildPipelineDayTimeline, countDeadlineUrgencies, fetchCommandCenterJson } from "./commandCenterUtils";
import type {
  CommandCenterBriefing,
  CommandCenterDeadlineResponse,
  CommandCenterOpportunityResponse,
  CommandCenterPortfolioResponse,
} from "./commandCenterTypes";
import {
  AutomationStreamSection,
  CommandCenterMetricStrip,
  DeadlineLoadSection,
  OperatingBriefSection,
  OpportunityRadarSection,
  PipelineFlowSection,
  PriorityQueueSection,
} from "./CommandCenterSections";
import { toast } from "sonner";

const revealTransition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

type WorkspaceMetric = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "critical" | "positive";
};

type WorkspaceFocus = {
  label: string;
  title: string;
  detail: string;
  tone?: "default" | "critical" | "positive";
};

/** Primary client workspace for the command-center route. */
export function CommandCenterWorkspace() {
  const reduceMotion = useReducedMotion();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: briefing,
    error: briefingError,
    isLoading: briefingLoading,
    mutate: mutateBriefing,
  } = useSWR<CommandCenterBriefing>("/api/intelligence/daily-briefing", fetchCommandCenterJson, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    errorRetryCount: 3,
  });

  const {
    data: portfolio,
    error: portfolioError,
    isLoading: portfolioLoading,
    mutate: mutatePortfolio,
  } = useSWR<CommandCenterPortfolioResponse>("/api/portfolio", fetchCommandCenterJson, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    errorRetryCount: 3,
  });

  const {
    data: deadlinesResponse,
    error: deadlinesError,
    isLoading: deadlinesLoading,
    mutate: mutateDeadlines,
  } = useSWR<CommandCenterDeadlineResponse>("/api/intelligence/deadlines", fetchCommandCenterJson, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    errorRetryCount: 3,
  });

  const {
    data: opportunitiesResponse,
    error: opportunitiesError,
    isLoading: opportunitiesLoading,
    mutate: mutateOpportunities,
  } = useSWR<CommandCenterOpportunityResponse>(
    "/api/opportunities?limit=6",
    fetchCommandCenterJson,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      errorRetryCount: 3,
    },
  );

  const deadlines = deadlinesResponse?.deadlines ?? [];
  const opportunities = opportunitiesResponse?.opportunities ?? [];
  const cadenceBuckets = useMemo(
    () => buildPipelineDayTimeline(portfolio?.deals ?? []),
    [portfolio?.deals],
  );
  const urgencyCounts = useMemo(() => countDeadlineUrgencies(deadlines), [deadlines]);

  const totalActive = briefing?.sections.pipelineSnapshot.stages.reduce(
    (sum, stage) => sum + stage.count,
    0,
  ) ?? 0;

  const metricItems = useMemo<WorkspaceMetric[]>(
    () => [
      {
        label: "Active pipeline",
        value: totalActive.toLocaleString(),
        detail: portfolio?.metrics.totalDeals
          ? `${portfolio.metrics.totalDeals} deals loaded in portfolio`
          : "Waiting for portfolio data",
      },
      {
        label: "Priority queue",
        value: String(briefing?.sections.needsAttention.items.length ?? 0),
        detail: briefing?.sections.needsAttention.items.length
          ? "Items currently waiting on review"
          : "No items currently blocked",
        tone:
          (briefing?.sections.needsAttention.items.length ?? 0) > 0 ? "critical" : "positive",
      },
      {
        label: "Urgent deadlines",
        value: String(urgencyCounts.black + urgencyCounts.red),
        detail:
          urgencyCounts.black + urgencyCounts.red > 0
            ? urgencyCounts.black > 0
              ? `${urgencyCounts.black} overdue and ${urgencyCounts.red} due within 24h`
              : `${urgencyCounts.red} due within 24h`
            : "No urgent deadlines loaded",
        tone: urgencyCounts.black + urgencyCounts.red > 0 ? "critical" : "positive",
      },
      {
        label: "Opportunity radar",
        value: String(opportunitiesResponse?.total ?? 0),
        detail:
          opportunitiesResponse?.total
            ? `${opportunities.length} surfaced in the current view`
            : "No fresh matches in the current queue",
      },
    ],
    [
      briefing?.sections.needsAttention.items.length,
      opportunities.length,
      opportunitiesResponse?.total,
      portfolio?.metrics.totalDeals,
      totalActive,
      urgencyCounts.black,
      urgencyCounts.red,
    ],
  );

  const heroSignals = useMemo<WorkspaceFocus[]>(
    () => [
      {
        label: "Operating brief",
        title: briefing ? "Fresh daily read" : "Brief incoming",
        detail:
          briefing?.summary ??
          "Waiting for the latest operating summary and activity digest.",
      },
      {
        label: "Priority queue",
        title:
          (briefing?.sections.needsAttention.items.length ?? 0) > 0
            ? `${briefing?.sections.needsAttention.items.length ?? 0} items need intervention`
            : "No blocked items right now",
        detail:
          briefing?.sections.needsAttention.items[0]?.title ??
          "Nothing is currently stalled or waiting on a decision.",
        tone:
          (briefing?.sections.needsAttention.items.length ?? 0) > 0 ? "critical" : "positive",
      },
      {
        label: "Deadline load",
        title:
          urgencyCounts.black + urgencyCounts.red > 0
            ? `${urgencyCounts.black + urgencyCounts.red} urgent deadlines`
            : "Deadline pressure is stable",
        detail:
          deadlines[0] != null
            ? `${deadlines[0].taskTitle} · ${deadlines[0].dealName}`
            : "No immediate deadline pressure surfaced in the current queue.",
        tone: urgencyCounts.black + urgencyCounts.red > 0 ? "critical" : "default",
      },
    ],
    [
      briefing,
      deadlines,
      urgencyCounts.black,
      urgencyCounts.red,
    ],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        mutateBriefing(),
        mutatePortfolio(),
        mutateDeadlines(),
        mutateOpportunities(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [mutateBriefing, mutateDeadlines, mutateOpportunities, mutatePortfolio]);

  const handleExport = useCallback(() => {
    if (isExporting || !briefing) {
      return;
    }

    setIsExporting(true);

    try {
      const escapeCsvCell = (value: string) =>
        `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      const rows: string[] = [];
      rows.push("# Command Center Export");
      rows.push(`"generatedAt","${briefing.generatedAt}"`);
      rows.push("");
      rows.push("## Brief");
      rows.push(escapeCsvCell(briefing.summary));
      rows.push("");
      rows.push("## Needs Attention");
      rows.push('"title","dealId","dealName","reason"');
      briefing.sections.needsAttention.items.forEach((item) => {
        rows.push(
          [
            escapeCsvCell(item.title),
            escapeCsvCell(item.dealId),
            escapeCsvCell(item.dealName),
            escapeCsvCell(item.reason),
          ].join(","),
        );
      });
      rows.push("");
      rows.push("## Deadlines");
      rows.push('"taskId","taskTitle","dealName","dueAt","urgency"');
      deadlines.forEach((deadline) => {
        rows.push(
          [
            escapeCsvCell(deadline.taskId),
            escapeCsvCell(deadline.taskTitle),
            escapeCsvCell(deadline.dealName),
            escapeCsvCell(deadline.dueAt),
            escapeCsvCell(deadline.urgency),
          ].join(","),
        );
      });
      rows.push("");
      rows.push("## Opportunities");
      rows.push('"id","address","savedSearch","matchScore","nextAction"');
      opportunities.forEach((opportunity) => {
        rows.push(
          [
            escapeCsvCell(opportunity.id),
            escapeCsvCell(opportunity.parcelData.address || opportunity.parcelData.parcelUid),
            escapeCsvCell(opportunity.savedSearch.name),
            escapeCsvCell(opportunity.matchScore),
            escapeCsvCell(opportunity.thesis.nextBestAction),
          ].join(","),
        );
      });

      const csv = `\uFEFF${rows.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `command-center-export-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Command center report exported.");
    } catch {
      toast.error("Failed to export command center report.");
    } finally {
      setIsExporting(false);
    }
  }, [briefing, deadlines, isExporting, opportunities]);

  const sectionMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: revealTransition,
      };

  return (
    <div className="workspace-page">
      <motion.div
        {...sectionMotion}
        className="workspace-hero"
      >
        <div className="workspace-hero-grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:items-end">
          <div className="space-y-4">
            <Badge variant="outline" className="gap-2">
              <Radar className="h-3.5 w-3.5" />
              Morning operator brief
            </Badge>
            <div>
              <p className="workspace-eyebrow">Command Center</p>
              <h1 className="mt-3 max-w-[15ch] text-4xl font-semibold tracking-[-0.06em] md:text-[3.4rem]">
                See what moved, what is blocked, and where to intervene.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Review the live brief, queue pressure, and deadline risk in one surface, then move directly into the items that need a decision.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/deals">Review active deals</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/opportunities">Review opportunity queue</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!briefing || isExporting}
              >
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting..." : "Export live brief"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                Refresh live brief
              </Button>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border/40 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            {heroSignals.map((item) => (
              <div
                key={item.label}
                className="border-b border-border/35 pb-4 last:border-b-0 last:pb-0"
              >
                <p className="workspace-section-kicker">{item.label}</p>
                <p
                  className={cn(
                    "mt-2 text-base font-medium tracking-[-0.03em]",
                    item.tone === "critical"
                      ? "text-destructive"
                      : item.tone === "positive"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                  )}
                >
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        {...sectionMotion}
        transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.05 }}
      >
        <CommandCenterMetricStrip
          items={metricItems}
          isLoading={briefingLoading || portfolioLoading || deadlinesLoading || opportunitiesLoading}
        />
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.75fr)]">
        <div className="space-y-6">
          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.1 }}
          >
            <OperatingBriefSection
              briefing={briefing}
              isLoading={briefingLoading}
              error={briefingError}
              onRetry={() => {
                void mutateBriefing();
              }}
            />
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.15 }}
          >
            <PriorityQueueSection
              items={briefing?.sections.needsAttention.items ?? []}
              isLoading={briefingLoading}
            />
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.2 }}
          >
            <OpportunityRadarSection
                opportunities={opportunities}
                total={opportunitiesResponse?.total ?? 0}
                isLoading={opportunitiesLoading}
                error={opportunitiesError}
                onRetry={() => {
                  void mutateOpportunities();
                }}
              />
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.25 }}
          >
            <PipelineFlowSection
              briefing={briefing}
              cadenceBuckets={cadenceBuckets}
              isLoading={briefingLoading || portfolioLoading}
              error={portfolioError}
              onRetry={() => {
                void mutatePortfolio();
              }}
            />
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.3 }}
            className="space-y-3"
          >
            <div className="workspace-section">
              <p className="workspace-section-kicker">Command center</p>
              <h2 className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Entitlement calibration
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Monitor model drift and timeline accuracy without leaving the workspace.
              </p>
            </div>
            <SectionErrorBoundary title="Entitlement KPI monitor">
              <EntitlementKpiWidget />
            </SectionErrorBoundary>
          </motion.div>
        </div>

        <motion.aside
          {...sectionMotion}
          transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.15 }}
          className="space-y-6"
        >
          <DeadlineLoadSection
            deadlines={deadlines}
            isLoading={deadlinesLoading}
            error={deadlinesError}
            onRetry={() => {
              void mutateDeadlines();
            }}
          />
          <AutomationStreamSection
            items={briefing?.sections.automationActivity.items ?? []}
            isLoading={briefingLoading}
          />
          <div className="workspace-section">
            <div className="workspace-section-header">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <p className="workspace-section-kicker">Command center</p>
                <h2 className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Operator handoff
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Move from the brief into runs, agents, or automation without losing context.
                </p>
              </div>
            </div>
            <div className="workspace-list mt-4 text-sm">
              <Link
                href="/runs"
                className="workspace-list-row items-center justify-between transition-colors hover:bg-muted/18"
              >
                <span>Review recent runs</span>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/agents"
                className="workspace-list-row items-center justify-between transition-colors hover:bg-muted/18"
              >
                <span>Open specialist roster</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/automation"
                className="workspace-list-row items-center justify-between transition-colors hover:bg-muted/18"
              >
                <span>Review automation health</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
