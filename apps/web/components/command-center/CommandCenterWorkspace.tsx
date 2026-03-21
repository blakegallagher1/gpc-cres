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
    <div className="space-y-6 pb-8">
      <motion.div
        {...sectionMotion}
        className="rounded-3xl border border-border/70 bg-muted/20 px-5 py-5 md:px-6"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="gap-2 px-3 py-1">
              <Radar className="h-3.5 w-3.5" />
              Operator workspace
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Command Center
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Review the daily brief, scan urgency, and move directly into the items
                that need a decision.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/deals">Open deals</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/opportunities">Open opportunities</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!briefing || isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
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
            {opportunitiesError ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                {opportunitiesError.message}
              </div>
            ) : (
              <OpportunityRadarSection
                opportunities={opportunities}
                total={opportunitiesResponse?.total ?? 0}
                isLoading={opportunitiesLoading}
              />
            )}
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.25 }}
          >
            {portfolioError ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                {portfolioError.message}
              </div>
            ) : (
              <PipelineFlowSection
                briefing={briefing}
                cadenceBuckets={cadenceBuckets}
                isLoading={briefingLoading || portfolioLoading}
              />
            )}
          </motion.div>

          <motion.div
            {...sectionMotion}
            transition={reduceMotion ? undefined : { ...revealTransition, delay: 0.3 }}
            className="space-y-3"
          >
            <div className="px-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
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
          />
          <AutomationStreamSection
            items={briefing?.sections.automationActivity.items ?? []}
            isLoading={briefingLoading}
          />
          <div className="rounded-2xl border border-border/70 bg-background/90 p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border/60 pb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Next move
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the brief to decide where to hand off next.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <Link
                href="/runs"
                className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span>Inspect recent runs</span>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/agents"
                className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span>Open agent roster</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/automation"
                className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3 transition-colors hover:bg-muted/40"
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
