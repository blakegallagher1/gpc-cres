import { prisma } from "@entitlement-os/db";
import { tool } from "@openai/agents";
import { z } from "zod";

type NumericLike = { toString(): string } | number | null | undefined;

type DealAssumptions = {
  acquisition?: {
    purchasePrice?: number;
  };
  income?: {
    rentPerSf?: number;
    vacancyPct?: number;
    otherIncome?: number;
  };
  expenses?: {
    opexPerSf?: number;
    managementFeePct?: number;
    insurance?: number;
    taxes?: number;
  };
  financing?: {
    ltvPct?: number;
    interestRate?: number;
    amortizationYears?: number;
  };
  exit?: {
    exitCapRate?: number;
    dispositionCostsPct?: number;
  };
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toAssumptions(raw: unknown): DealAssumptions {
  return isRecord(raw) ? (raw as DealAssumptions) : {};
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function asPercent(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return value > 1 ? value / 100 : value;
}

function estimateAnnualDebtService(
  loanAmount: number,
  rate: number | null,
  amortizationYears: number | null,
): number {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    return 0;
  }
  const normalizedRate = asPercent(rate ?? null, 0.065);
  const years = amortizationYears && amortizationYears > 0 ? amortizationYears : 30;
  const monthlyRate = normalizedRate / 12;
  const payments = years * 12;
  if (monthlyRate <= 0) {
    return loanAmount / years;
  }
  const monthlyPayment =
    loanAmount *
    ((monthlyRate * Math.pow(1 + monthlyRate, payments)) /
      (Math.pow(1 + monthlyRate, payments) - 1));
  return monthlyPayment * 12;
}

function deriveAnnualNoi(input: {
  assumptions: DealAssumptions;
  grossArea: number;
  leases: Array<{ rentedAreaSf: NumericLike; rentPerSf: NumericLike }>;
}): number {
  const leasedRevenue = input.leases.reduce((sum, lease) => {
    const area = toNumber(lease.rentedAreaSf) ?? 0;
    const rent = toNumber(lease.rentPerSf) ?? 0;
    return sum + area * rent;
  }, 0);
  const vacancyPct = asPercent(input.assumptions.income?.vacancyPct ?? null, 0.05);
  const stabilizedRevenue =
    leasedRevenue > 0
      ? leasedRevenue
      : input.grossArea * (input.assumptions.income?.rentPerSf ?? 0);
  const effectiveGrossIncome =
    stabilizedRevenue * (1 - vacancyPct) + (input.assumptions.income?.otherIncome ?? 0);
  const operatingExpenses =
    input.grossArea * (input.assumptions.expenses?.opexPerSf ?? 0) +
    input.grossArea * (input.assumptions.expenses?.insurance ?? 0) +
    input.grossArea * (input.assumptions.expenses?.taxes ?? 0) +
    effectiveGrossIncome * asPercent(input.assumptions.expenses?.managementFeePct ?? null, 0.05);
  return effectiveGrossIncome - operatingExpenses;
}

async function loadCapitalMarketsSnapshot(orgId: string, dealId: string) {
  return prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: {
      primaryAsset: true,
      terms: true,
      tenantLeases: true,
      financings: {
        orderBy: [{ fundedDate: "desc" }, { createdAt: "desc" }],
      },
      capitalSources: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      equityWaterfalls: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      stakeholders: {
        orderBy: [{ createdAt: "asc" }],
      },
      risks: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
      tasks: {
        orderBy: [{ dueAt: "asc" }, { pipelineStep: "asc" }],
      },
    },
  });
}

export const capital_debt_sizing_overview = tool({
  name: "capital_debt_sizing_overview",
  description:
    "Estimate debt capacity from current NOI and compare DSCR and LTV constraints against the existing capital plan.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
    dscrTarget: z.number().nullable().describe("Target DSCR, or null to default to 1.25x."),
    ltvCapPct: z.number().nullable().describe("Maximum LTV as a percent or decimal, or null to use stored assumptions."),
  }),
  execute: async ({ orgId, dealId, dscrTarget, ltvCapPct }) => {
    const deal = await loadCapitalMarketsSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const assumptions = toAssumptions(deal.financialModelAssumptions);
    const grossArea = toNumber(deal.primaryAsset?.sfGross) ?? toNumber(deal.primaryAsset?.sfNet) ?? 0;
    const annualNoi = deriveAnnualNoi({
      assumptions,
      grossArea,
      leases: deal.tenantLeases,
    });
    const latestFinancing = deal.financings[0] ?? null;
    const purchasePrice =
      toNumber(deal.terms?.offerPrice) ??
      assumptions.acquisition?.purchasePrice ??
      0;
    const ltvCap = asPercent(ltvCapPct ?? assumptions.financing?.ltvPct ?? null, 0.65);
    const targetDscr = dscrTarget ?? 1.25;
    const annualDebtCapacity = annualNoi / targetDscr;
    const currentRate = toNumber(latestFinancing?.interestRate) ?? assumptions.financing?.interestRate ?? 6.5;
    const currentAmortization =
      latestFinancing?.amortizationYears ?? assumptions.financing?.amortizationYears ?? 30;
    const monthlyRate = asPercent(currentRate, 0.065) / 12;
    const payments = currentAmortization * 12;
    const maxLoanByDscr =
      monthlyRate > 0
        ? (annualDebtCapacity / 12) *
          ((Math.pow(1 + monthlyRate, payments) - 1) /
            (monthlyRate * Math.pow(1 + monthlyRate, payments)))
        : annualDebtCapacity * currentAmortization;
    const maxLoanByLtv = purchasePrice * ltvCap;

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      annualNoi: round(annualNoi, 0),
      targetDscr,
      maxLoanByDscr: round(maxLoanByDscr, 0),
      maxLoanByLtv: round(maxLoanByLtv, 0),
      recommendedLoan: round(Math.min(maxLoanByDscr, maxLoanByLtv), 0),
      currentLoanAmount: round(toNumber(latestFinancing?.loanAmount), 0),
      annualDebtCapacity: round(annualDebtCapacity, 0),
    });
  },
});

export const capital_lender_outreach_brief = tool({
  name: "capital_lender_outreach_brief",
  description:
    "Summarize lender and broker contacts, current financing facts, and the deal narrative needed for lender outreach.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to summarize."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadCapitalMarketsSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const latestFinancing = deal.financings[0] ?? null;
    const outreachContacts = deal.stakeholders
      .filter((stakeholder) => stakeholder.role === "LENDER" || stakeholder.role === "BROKER")
      .map((stakeholder) => ({
        role: stakeholder.role,
        name: stakeholder.name,
        company: stakeholder.company,
        email: stakeholder.email,
        phone: stakeholder.phone,
        notes: stakeholder.notes,
      }));

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      strategy: deal.strategy,
      opportunityKind: deal.opportunityKind,
      marketName: deal.marketName,
      currentFacility: latestFinancing
        ? {
            lenderName: latestFinancing.lenderName,
            facilityName: latestFinancing.facilityName,
            loanType: latestFinancing.loanType,
            status: latestFinancing.status,
            loanAmount: round(toNumber(latestFinancing.loanAmount), 0),
            interestRatePct: round(toNumber(latestFinancing.interestRate), 2),
            ltvPercent: round(toNumber(latestFinancing.ltvPercent), 2),
            dscrRequirement: round(toNumber(latestFinancing.dscrRequirement), 2),
          }
        : null,
      outreachContacts,
      investmentSummary: deal.investmentSummary,
      businessPlanSummary: deal.businessPlanSummary,
    });
  },
});

export const capital_disposition_analysis = tool({
  name: "capital_disposition_analysis",
  description:
    "Estimate sale pricing, cap-rate framing, and disposition readiness based on current NOI, open risks, and open execution items.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
    exitCapRate: z.number().nullable().describe("Override exit cap rate as a percent or decimal, or null to use stored assumptions."),
  }),
  execute: async ({ orgId, dealId, exitCapRate }) => {
    const deal = await loadCapitalMarketsSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const assumptions = toAssumptions(deal.financialModelAssumptions);
    const grossArea = toNumber(deal.primaryAsset?.sfGross) ?? toNumber(deal.primaryAsset?.sfNet) ?? 0;
    const annualNoi = deriveAnnualNoi({
      assumptions,
      grossArea,
      leases: deal.tenantLeases,
    });
    const normalizedExitCapRate = asPercent(
      exitCapRate ?? assumptions.exit?.exitCapRate ?? null,
      0.0725,
    );
    const estimatedValue = normalizedExitCapRate > 0 ? annualNoi / normalizedExitCapRate : 0;
    const openTasks = deal.tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
    const activeRisks = deal.risks.filter((risk) => risk.status !== "DONE");

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      annualNoi: round(annualNoi, 0),
      exitCapRatePct: round(normalizedExitCapRate * 100, 2),
      estimatedGrossValue: round(estimatedValue, 0),
      estimatedNetValue: round(
        estimatedValue * (1 - asPercent(assumptions.exit?.dispositionCostsPct ?? null, 0.02)),
        0,
      ),
      saleReadiness: {
        openTaskCount: openTasks.length,
        activeRiskCount: activeRisks.length,
        highSeverityRiskCount: activeRisks.filter((risk) => {
          const severity = risk.severity?.toUpperCase();
          return severity === "HIGH" || severity === "CRITICAL";
        }).length,
      },
    });
  },
});

export const capital_refinance_scenarios = tool({
  name: "capital_refinance_scenarios",
  description:
    "Model refinance proceeds under conservative, base, and upside assumptions using current NOI and debt terms.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadCapitalMarketsSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const assumptions = toAssumptions(deal.financialModelAssumptions);
    const grossArea = toNumber(deal.primaryAsset?.sfGross) ?? toNumber(deal.primaryAsset?.sfNet) ?? 0;
    const annualNoi = deriveAnnualNoi({
      assumptions,
      grossArea,
      leases: deal.tenantLeases,
    });
    const latestFinancing = deal.financings[0] ?? null;
    const scenarios = [
      { name: "conservative", ltvPct: 0.55, dscr: 1.35, rate: 0.0725 },
      { name: "base", ltvPct: 0.65, dscr: 1.25, rate: 0.0675 },
      { name: "upside", ltvPct: 0.7, dscr: 1.2, rate: 0.0625 },
    ].map((scenario) => {
      const annualDebtCapacity = annualNoi / scenario.dscr;
      const maxLoanByDscr = annualDebtCapacity / scenario.rate;
      const purchasePrice =
        toNumber(deal.terms?.offerPrice) ??
        assumptions.acquisition?.purchasePrice ??
        0;
      const maxLoanByLtv = purchasePrice * scenario.ltvPct;
      const recommendedLoan = Math.min(maxLoanByDscr, maxLoanByLtv);
      return {
        name: scenario.name,
        ltvPct: round(scenario.ltvPct * 100, 2),
        dscr: scenario.dscr,
        interestRatePct: round(scenario.rate * 100, 2),
        recommendedLoan: round(recommendedLoan, 0),
        annualDebtService: round(
          estimateAnnualDebtService(recommendedLoan, scenario.rate, latestFinancing?.amortizationYears ?? 30),
          0,
        ),
      };
    });

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      annualNoi: round(annualNoi, 0),
      currentLoanAmount: round(toNumber(latestFinancing?.loanAmount), 0),
      scenarios,
    });
  },
});

export const capital_stack_optimization = tool({
  name: "capital_stack_optimization",
  description:
    "Summarize the current debt and equity stack, highlight gaps, and compare it to the active financing plan.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadCapitalMarketsSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const totalDebt = deal.capitalSources.reduce((sum, source) => {
      return source.sourceKind === "DEBT" || source.sourceKind === "MEZZ"
        ? sum + (toNumber(source.amount) ?? 0)
        : sum;
    }, 0);
    const totalEquity = deal.capitalSources.reduce((sum, source) => {
      return source.sourceKind === "DEBT" || source.sourceKind === "MEZZ"
        ? sum
        : sum + (toNumber(source.amount) ?? 0);
    }, 0);
    const totalSources = totalDebt + totalEquity;

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      totalDebt: round(totalDebt, 0),
      totalEquity: round(totalEquity, 0),
      debtSharePct: round(totalSources > 0 ? (totalDebt / totalSources) * 100 : null, 2),
      equitySharePct: round(totalSources > 0 ? (totalEquity / totalSources) * 100 : null, 2),
      capitalSources: deal.capitalSources.map((source) => ({
        name: source.name,
        sourceKind: source.sourceKind,
        amount: round(toNumber(source.amount), 0),
        notes: source.notes,
      })),
      waterfallTiers: deal.equityWaterfalls.map((tier) => ({
        tierName: tier.tierName,
        hurdleIrrPct: round(toNumber(tier.hurdleIrrPct), 2),
        lpDistributionPct: round(toNumber(tier.lpDistributionPct), 2),
        gpDistributionPct: round(toNumber(tier.gpDistributionPct), 2),
      })),
    });
  },
});
