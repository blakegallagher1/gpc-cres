import { prisma } from "@entitlement-os/db";

export interface HydratedDealContext {
  id: string;
  name: string;
  status: string;
  currentStageKey: string | null;
  workflowTemplateKey: string | null;
  assetClass: string | null;
  strategy: string | null;
  marketName: string | null;
  jurisdiction: { id: string; name: string; state: string } | null;
  primaryAsset: {
    name: string;
    address: string | null;
    parcelNumber: string | null;
    acreage: number | null;
  } | null;
  latestTriage: {
    scoredAt: string;
    overallScore: number | null;
    decision: string | null;
    topRisks: string[];
  } | null;
  financial: {
    hasAssumptions: boolean;
    scenarioCount: number;
    latestIrrPct: number | null;
    latestDscr: number | null;
    latestLtvPct: number | null;
  };
  parcelCount: number;
  openTaskCount: number;
  recentStageHistory: Array<{
    from: string | null;
    to: string;
    changedAt: string;
    note: string | null;
  }>;
  recentAutomationEvents: Array<{
    handlerName: string;
    eventType: string;
    status: string;
    startedAt: string;
    errorCode?: string | null;
  }>;
  stakeholderCount: number;
  openRiskCount: number;
  openApprovalCount: number;
}

interface HydratorOptions {
  includeAutomationEvents?: boolean;
  automationEventLimit?: number;
  stageHistoryLimit?: number;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractLatestFinancials(
  scenariosJson: unknown,
): {
  scenarioCount: number;
  latestIrrPct: number | null;
  latestDscr: number | null;
  latestLtvPct: number | null;
} {
  if (!Array.isArray(scenariosJson)) {
    return { scenarioCount: 0, latestIrrPct: null, latestDscr: null, latestLtvPct: null };
  }
  const scenarios = scenariosJson as Array<Record<string, unknown>>;
  if (scenarios.length === 0) {
    return { scenarioCount: 0, latestIrrPct: null, latestDscr: null, latestLtvPct: null };
  }
  const latest = scenarios[scenarios.length - 1] ?? {};
  const results =
    (latest.results as Record<string, unknown> | undefined) ??
    (latest.outputs as Record<string, unknown> | undefined) ??
    latest;
  return {
    scenarioCount: scenarios.length,
    latestIrrPct: toNumberOrNull((results as Record<string, unknown>).irr ?? (results as Record<string, unknown>).irrPct),
    latestDscr: toNumberOrNull((results as Record<string, unknown>).dscr),
    latestLtvPct: toNumberOrNull((results as Record<string, unknown>).ltv ?? (results as Record<string, unknown>).ltvPct),
  };
}

function extractTriageSummary(
  latestTriageRun: { outputJson: unknown; startedAt: Date } | null,
): HydratedDealContext["latestTriage"] {
  if (!latestTriageRun) return null;
  const summary =
    (latestTriageRun.outputJson as Record<string, unknown> | null | undefined) ?? null;
  if (!summary) {
    return {
      scoredAt: latestTriageRun.startedAt.toISOString(),
      overallScore: null,
      decision: null,
      topRisks: [],
    };
  }
  const scoring = (summary.scoring as Record<string, unknown> | undefined) ?? null;
  const risks = (summary.topRisks as string[] | undefined) ?? [];
  return {
    scoredAt: latestTriageRun.startedAt.toISOString(),
    overallScore: toNumberOrNull(scoring?.overallScore ?? summary.overallScore),
    decision: typeof summary.decision === "string" ? summary.decision : null,
    topRisks: Array.isArray(risks) ? risks.slice(0, 5) : [],
  };
}

export async function hydrateDealContext(
  orgId: string,
  dealId: string,
  options: HydratorOptions = {},
): Promise<HydratedDealContext | null> {
  const {
    includeAutomationEvents = true,
    automationEventLimit = 5,
    stageHistoryLimit = 5,
  } = options;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: {
      id: true,
      name: true,
      status: true,
      currentStageKey: true,
      workflowTemplateKey: true,
      assetClass: true,
      strategy: true,
      marketName: true,
      financialModelAssumptions: true,
      financialModelScenarios: true,
      jurisdiction: {
        select: { id: true, name: true, state: true },
      },
      primaryAsset: {
        select: {
          name: true,
          address: true,
          parcelNumber: true,
          acreage: true,
        },
      },
    },
  });

  if (!deal) return null;

  const [
    latestTriageRun,
    parcelCount,
    openTaskCount,
    stageHistory,
    automationEvents,
    stakeholderCount,
    openRiskCount,
    openApprovalCount,
  ] = await Promise.all([
    prisma.run.findFirst({
      where: { orgId, dealId, runType: "TRIAGE" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, outputJson: true },
    }),
    prisma.parcel.count({ where: { orgId, dealId } }),
    prisma.task.count({ where: { orgId, dealId, status: { in: ["TODO", "IN_PROGRESS"] } } }),
    prisma.dealStageHistory.findMany({
      where: { orgId, dealId },
      orderBy: { changedAt: "desc" },
      take: stageHistoryLimit,
      select: { fromStageKey: true, toStageKey: true, changedAt: true, note: true },
    }),
    includeAutomationEvents
      ? prisma.automationEvent.findMany({
          where: { orgId, dealId },
          orderBy: { startedAt: "desc" },
          take: automationEventLimit,
          select: {
            handlerName: true,
            eventType: true,
            status: true,
            startedAt: true,
            outputData: true,
          },
        })
      : Promise.resolve([]),
    prisma.dealStakeholder.count({ where: { orgId, dealId } }),
    prisma.dealRisk.count({
      where: { orgId, dealId, status: { in: ["open", "monitoring"] } },
    }),
    prisma.approvalRequest.count({
      where: { dealId, status: "pending", deal: { orgId } },
    }),
  ]);

  const financial = {
    hasAssumptions: Boolean(deal.financialModelAssumptions),
    ...extractLatestFinancials(deal.financialModelScenarios),
  };

  return {
    id: deal.id,
    name: deal.name,
    status: deal.status,
    currentStageKey: deal.currentStageKey ?? null,
    workflowTemplateKey: deal.workflowTemplateKey ?? null,
    assetClass: deal.assetClass ?? null,
    strategy: deal.strategy ?? null,
    marketName: deal.marketName ?? null,
    jurisdiction: deal.jurisdiction
      ? {
          id: deal.jurisdiction.id,
          name: deal.jurisdiction.name,
          state: deal.jurisdiction.state,
        }
      : null,
    primaryAsset: deal.primaryAsset
      ? {
          name: deal.primaryAsset.name,
          address: deal.primaryAsset.address,
          parcelNumber: deal.primaryAsset.parcelNumber,
          acreage: deal.primaryAsset.acreage ? Number(deal.primaryAsset.acreage) : null,
        }
      : null,
    latestTriage: extractTriageSummary(latestTriageRun),
    financial,
    parcelCount,
    openTaskCount,
    recentStageHistory: stageHistory.map((entry) => ({
      from: entry.fromStageKey ?? null,
      to: entry.toStageKey,
      changedAt: entry.changedAt.toISOString(),
      note: entry.note,
    })),
    recentAutomationEvents: automationEvents.map((event) => {
      const output = (event.outputData ?? {}) as Record<string, unknown>;
      return {
        handlerName: event.handlerName,
        eventType: event.eventType,
        status: event.status,
        startedAt: event.startedAt.toISOString(),
        errorCode:
          typeof output.errorCode === "string" ? (output.errorCode as string) : null,
      };
    }),
    stakeholderCount,
    openRiskCount,
    openApprovalCount,
  };
}

export function renderDealContextBlock(context: HydratedDealContext): string {
  const lines: string[] = ["[Deal context — hydrated at conversation start]"];
  lines.push(`Deal: ${context.name} (id=${context.id})`);
  lines.push(`Status: ${context.status}` + (context.currentStageKey ? ` · stage=${context.currentStageKey}` : ""));
  if (context.workflowTemplateKey) {
    lines.push(`Workflow: ${context.workflowTemplateKey}`);
  }
  if (context.assetClass || context.strategy) {
    lines.push(
      `Class: ${context.assetClass ?? "—"} · Strategy: ${context.strategy ?? "—"}`,
    );
  }
  if (context.jurisdiction) {
    lines.push(`Jurisdiction: ${context.jurisdiction.name}, ${context.jurisdiction.state}`);
  }
  if (context.marketName) {
    lines.push(`Market: ${context.marketName}`);
  }
  if (context.primaryAsset) {
    const acres = context.primaryAsset.acreage ? ` · ${context.primaryAsset.acreage} ac` : "";
    lines.push(
      `Primary asset: ${context.primaryAsset.name}` +
        (context.primaryAsset.address ? ` @ ${context.primaryAsset.address}` : "") +
        (context.primaryAsset.parcelNumber ? ` · APN ${context.primaryAsset.parcelNumber}` : "") +
        acres,
    );
  }
  lines.push(
    `Counts: parcels=${context.parcelCount} · openTasks=${context.openTaskCount} · stakeholders=${context.stakeholderCount} · openRisks=${context.openRiskCount} · pendingApprovals=${context.openApprovalCount}`,
  );
  if (context.latestTriage) {
    const score =
      context.latestTriage.overallScore !== null
        ? `score=${context.latestTriage.overallScore.toFixed(1)}`
        : "score=—";
    const decision = context.latestTriage.decision
      ? ` · decision=${context.latestTriage.decision}`
      : "";
    const risks =
      context.latestTriage.topRisks.length > 0
        ? ` · topRisks=[${context.latestTriage.topRisks.join(", ")}]`
        : "";
    lines.push(
      `Latest triage (${context.latestTriage.scoredAt.slice(0, 10)}): ${score}${decision}${risks}`,
    );
  } else {
    lines.push("Latest triage: none");
  }
  if (context.financial.hasAssumptions || context.financial.scenarioCount > 0) {
    const parts: string[] = [];
    if (context.financial.latestIrrPct !== null) {
      parts.push(`IRR=${context.financial.latestIrrPct.toFixed(2)}%`);
    }
    if (context.financial.latestDscr !== null) {
      parts.push(`DSCR=${context.financial.latestDscr.toFixed(2)}`);
    }
    if (context.financial.latestLtvPct !== null) {
      parts.push(`LTV=${context.financial.latestLtvPct.toFixed(1)}%`);
    }
    lines.push(
      `Financial model: scenarios=${context.financial.scenarioCount}` +
        (parts.length > 0 ? ` · latest { ${parts.join(", ")} }` : ""),
    );
  }
  if (context.recentStageHistory.length > 0) {
    lines.push("Recent stage moves:");
    for (const entry of context.recentStageHistory) {
      const noteSuffix = entry.note ? ` — ${entry.note.slice(0, 120)}` : "";
      lines.push(
        `  · ${entry.changedAt.slice(0, 10)} ${entry.from ?? "∅"} → ${entry.to}${noteSuffix}`,
      );
    }
  }
  if (context.recentAutomationEvents.length > 0) {
    lines.push("Recent automation events:");
    for (const event of context.recentAutomationEvents) {
      const errSuffix = event.errorCode ? ` [${event.errorCode}]` : "";
      lines.push(
        `  · ${event.startedAt.slice(0, 16).replace("T", " ")} ${event.handlerName}.${event.eventType} (${event.status})${errSuffix}`,
      );
    }
  }
  lines.push("[/Deal context]");
  return lines.join("\n");
}
