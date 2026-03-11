import { prisma } from "@entitlement-os/db";
import { tool } from "@openai/agents";
import { z } from "zod";

type NumericLike = { toString(): string } | number | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: NumericLike): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) {
    return null;
  }
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function getBudgetLineItemAmount(item: unknown): number {
  if (!isRecord(item)) {
    return 0;
  }
  return toNumber(item.amount as NumericLike) ?? 0;
}

async function loadAssetManagementSnapshot(orgId: string, dealId: string) {
  return prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: {
      primaryAsset: true,
      tenantLeases: {
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ endDate: "asc" }, { createdAt: "asc" }],
      },
      risks: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { pipelineStep: "asc" }],
      },
      capitalDeployments: {
        orderBy: [{ deploymentDate: "desc" }, { createdAt: "desc" }],
      },
      developmentBudget: true,
    },
  });
}

export const asset_lease_admin_summary = tool({
  name: "asset_lease_admin_summary",
  description:
    "Summarize lease administration status, upcoming expirations, weighted average lease term, and rollover timing for an operating asset.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to summarize."),
    monthsForward: z.number().nullable().describe("Look-forward window in months for expirations, or null to default to 12 months."),
  }),
  execute: async ({ orgId, dealId, monthsForward }) => {
    const deal = await loadAssetManagementSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const horizonDays = (monthsForward ?? 12) * 30;
    const leaseRows = deal.tenantLeases.map((lease) => {
      const area = toNumber(lease.rentedAreaSf) ?? 0;
      const rentPerSf = toNumber(lease.rentPerSf) ?? 0;
      return {
        tenantName: lease.tenant?.name ?? "Unknown tenant",
        leaseName: lease.leaseName,
        rentedAreaSf: round(area, 2),
        annualBaseRent: round(area * rentPerSf, 0),
        rentPerSf: round(rentPerSf, 2),
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        daysToExpiry: daysUntil(lease.endDate),
      };
    });

    const expiringSoon = leaseRows.filter((lease) => {
      const daysToExpiry = lease.daysToExpiry;
      return daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= horizonDays;
    });
    const totalArea = leaseRows.reduce((sum, lease) => sum + (lease.rentedAreaSf ?? 0), 0);
    const weightedLeaseDays = leaseRows.reduce((sum, lease) => {
      const daysToExpiry = Math.max(lease.daysToExpiry ?? 0, 0);
      return sum + daysToExpiry * (lease.rentedAreaSf ?? 0);
    }, 0);

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      leaseCount: leaseRows.length,
      weightedAverageLeaseTermDays: round(totalArea > 0 ? weightedLeaseDays / totalArea : null, 1),
      expiringLeaseCount: expiringSoon.length,
      expiringLeaseSf: round(
        expiringSoon.reduce((sum, lease) => sum + (lease.rentedAreaSf ?? 0), 0),
        2,
      ),
      leases: leaseRows,
    });
  },
});

export const asset_tenant_exposure_analysis = tool({
  name: "asset_tenant_exposure_analysis",
  description:
    "Analyze tenant concentration, lease-area exposure, and rent dependence for asset-management decision making.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadAssetManagementSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const tenantMap = new Map<
      string,
      {
        tenantName: string;
        leasedSf: number;
        annualBaseRent: number;
        leaseCount: number;
      }
    >();

    for (const lease of deal.tenantLeases) {
      const tenantName = lease.tenant?.name ?? "Unknown tenant";
      const area = toNumber(lease.rentedAreaSf) ?? 0;
      const annualBaseRent = area * (toNumber(lease.rentPerSf) ?? 0);
      const current =
        tenantMap.get(tenantName) ??
        { tenantName, leasedSf: 0, annualBaseRent: 0, leaseCount: 0 };
      current.leasedSf += area;
      current.annualBaseRent += annualBaseRent;
      current.leaseCount += 1;
      tenantMap.set(tenantName, current);
    }

    const exposureRows = [...tenantMap.values()]
      .map((row) => ({
        tenantName: row.tenantName,
        leaseCount: row.leaseCount,
        leasedSf: round(row.leasedSf, 2),
        annualBaseRent: round(row.annualBaseRent, 0),
      }))
      .sort((a, b) => (b.annualBaseRent ?? 0) - (a.annualBaseRent ?? 0));

    const totalBaseRent = exposureRows.reduce((sum, row) => sum + (row.annualBaseRent ?? 0), 0);

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      tenantCount: exposureRows.length,
      topTenantRentSharePct: round(
        totalBaseRent > 0 ? ((exposureRows[0]?.annualBaseRent ?? 0) / totalBaseRent) * 100 : null,
        2,
      ),
      tenantExposure: exposureRows.map((row) => ({
        ...row,
        rentSharePct: round(
          totalBaseRent > 0 ? ((row.annualBaseRent ?? 0) / totalBaseRent) * 100 : null,
          2,
        ),
      })),
    });
  },
});

export const asset_noi_optimization_plan = tool({
  name: "asset_noi_optimization_plan",
  description:
    "Identify NOI improvement levers from vacancy, lease rollover, and operating-risk backlog for a managed asset.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadAssetManagementSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const grossArea = toNumber(deal.primaryAsset?.sfGross) ?? toNumber(deal.primaryAsset?.sfNet) ?? 0;
    const occupiedSf = deal.tenantLeases.reduce(
      (sum, lease) => sum + (toNumber(lease.rentedAreaSf) ?? 0),
      0,
    );
    const annualBaseRent = deal.tenantLeases.reduce((sum, lease) => {
      const area = toNumber(lease.rentedAreaSf) ?? 0;
      const rent = toNumber(lease.rentPerSf) ?? 0;
      return sum + area * rent;
    }, 0);
    const weightedAvgRent = occupiedSf > 0 ? annualBaseRent / occupiedSf : null;
    const vacancySf = Math.max(grossArea - occupiedSf, 0);
    const expiringSoon = deal.tenantLeases.filter((lease) => {
      const daysToExpiry = daysUntil(lease.endDate);
      return daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 365;
    });
    const openRiskCount = deal.risks.filter((risk) => risk.status !== "DONE").length;

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      vacancySf: round(vacancySf, 2),
      occupancyPct: round(grossArea > 0 ? (occupiedSf / grossArea) * 100 : null, 2),
      weightedAverageRentPsf: round(weightedAvgRent, 2),
      leasesExpiringWithin12Months: expiringSoon.length,
      openRiskCount,
      priorities: [
        vacancySf > 0
          ? `Backfill approximately ${round(vacancySf, 0)} SF of vacancy to convert idle area into rent.`
          : "Occupancy is full; focus on rent mark-to-market and renewals.",
        expiringSoon.length > 0
          ? `${expiringSoon.length} lease(s) roll within 12 months and should be prioritized for early renewal strategy.`
          : "Near-term rollover exposure is limited; focus on operating cost discipline.",
        openRiskCount > 0
          ? `${openRiskCount} open risk item(s) could pressure collections, leasing, or operating expenses.`
          : "Risk backlog is manageable; prioritize rent growth and expense controls.",
      ],
    });
  },
});

export const asset_capital_plan_summary = tool({
  name: "asset_capital_plan_summary",
  description:
    "Summarize committed and deployed capital, upcoming deployment stages, and remaining budget load for asset management planning.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to summarize."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadAssetManagementSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const deploymentRows = deal.capitalDeployments.map((deployment) => ({
      stage: deployment.stage,
      deploymentDate: deployment.deploymentDate.toISOString(),
      capitalCommitted: round(toNumber(deployment.capitalCommitted), 0),
      capitalDeployed: round(toNumber(deployment.capitalDeployed), 0),
      nonRecoverableExpense: round(toNumber(deployment.nonRecoverableExpense), 0),
    }));

    const budgetLineItems = Array.isArray(deal.developmentBudget?.lineItems)
      ? deal.developmentBudget?.lineItems
      : [];
    const remainingBudget = budgetLineItems.reduce<number>(
      (sum, item) => sum + getBudgetLineItemAmount(item),
      0,
    );

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      totalCommitted: round(
        deal.capitalDeployments.reduce(
          (sum, deployment) => sum + (toNumber(deployment.capitalCommitted) ?? 0),
          0,
        ),
        0,
      ),
      totalDeployed: round(
        deal.capitalDeployments.reduce(
          (sum, deployment) => sum + (toNumber(deployment.capitalDeployed) ?? 0),
          0,
        ),
        0,
      ),
      remainingBudgetLoad: round(remainingBudget, 0),
      deployments: deploymentRows,
    });
  },
});

export const asset_operations_health = tool({
  name: "asset_operations_health",
  description:
    "Summarize operating readiness from open tasks, active risks, and lease administration pressure points.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to summarize."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadAssetManagementSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const openTasks = deal.tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
    const blockedTasks = openTasks.filter((task) => task.status === "BLOCKED");
    const activeRisks = deal.risks.filter((risk) => risk.status !== "DONE");
    const highSeverityRisks = activeRisks.filter((risk) => {
      const severity = risk.severity?.toUpperCase();
      return severity === "HIGH" || severity === "CRITICAL";
    });

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      currentStageKey: deal.currentStageKey,
      openTaskCount: openTasks.length,
      blockedTaskCount: blockedTasks.length,
      activeRiskCount: activeRisks.length,
      highSeverityRiskCount: highSeverityRisks.length,
      blockedTasks: blockedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      activeRisks: highSeverityRisks.map((risk) => ({
        id: risk.id,
        title: risk.title,
        severity: risk.severity,
        status: risk.status,
      })),
    });
  },
});
