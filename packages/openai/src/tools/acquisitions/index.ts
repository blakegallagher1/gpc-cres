import { prisma } from "@entitlement-os/db";
import { tool } from "@openai/agents";
import { z } from "zod";

type NumericLike = { toString(): string } | number | null | undefined;

type DealAssumptions = {
  acquisition?: {
    purchasePrice?: number;
    closingCostsPct?: number;
    earnestMoney?: number;
  };
  income?: {
    rentPerSf?: number;
    vacancyPct?: number;
    rentGrowthPct?: number;
    otherIncome?: number;
  };
  expenses?: {
    opexPerSf?: number;
    managementFeePct?: number;
    insurance?: number;
    taxes?: number;
    capexReserves?: number;
  };
  financing?: {
    ltvPct?: number;
    interestRate?: number;
    amortizationYears?: number;
    loanFeePct?: number;
  };
  exit?: {
    holdYears?: number;
    exitCapRate?: number;
    dispositionCostsPct?: number;
  };
  buildableSf?: number;
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

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) {
    return null;
  }
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
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

function estimateRemainingBalance(
  loanAmount: number,
  rate: number,
  amortizationYears: number,
  holdYears: number,
): number {
  const monthlyRate = rate / 12;
  const payments = amortizationYears * 12;
  const elapsedPayments = Math.min(Math.max(Math.round(holdYears * 12), 0), payments);
  if (monthlyRate <= 0) {
    return Math.max(loanAmount * (1 - elapsedPayments / payments), 0);
  }
  const numerator =
    Math.pow(1 + monthlyRate, payments) - Math.pow(1 + monthlyRate, elapsedPayments);
  const denominator = Math.pow(1 + monthlyRate, payments) - 1;
  return loanAmount * (numerator / denominator);
}

function computeIrr(cashFlows: number[]): number | null {
  if (cashFlows.length < 2 || cashFlows.every((value) => value >= 0)) {
    return null;
  }

  let guess = 0.12;
  for (let index = 0; index < 50; index += 1) {
    let npv = 0;
    let derivative = 0;
    for (let period = 0; period < cashFlows.length; period += 1) {
      const denominator = Math.pow(1 + guess, period);
      npv += cashFlows[period] / denominator;
      if (period > 0) {
        derivative -= (period * cashFlows[period]) / (denominator * (1 + guess));
      }
    }
    if (Math.abs(npv) < 1e-7) {
      return guess;
    }
    if (Math.abs(derivative) < 1e-9) {
      break;
    }
    guess -= npv / derivative;
    if (guess <= -0.99 || !Number.isFinite(guess)) {
      return null;
    }
  }
  return null;
}

function resolveArea(sfGross: NumericLike, sfNet: NumericLike, assumptions: DealAssumptions): number {
  return (
    toNumber(sfGross) ??
    toNumber(sfNet) ??
    assumptions.buildableSf ??
    0
  );
}

function annualizedRentFromLeases(
  leases: Array<{
    rentedAreaSf: NumericLike;
    rentPerSf: NumericLike;
  }>,
): number {
  return leases.reduce((sum, lease) => {
    const area = toNumber(lease.rentedAreaSf) ?? 0;
    const rent = toNumber(lease.rentPerSf) ?? 0;
    return sum + area * rent;
  }, 0);
}

function deriveAnnualNoi(input: {
  assumptions: DealAssumptions;
  grossArea: number;
  leasedRevenue: number;
}): {
  annualNoi: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  stabilizedRevenue: number;
  vacancyLoss: number;
} {
  const vacancyPct = asPercent(input.assumptions.income?.vacancyPct ?? null, 0.05);
  const rentPerSf = input.assumptions.income?.rentPerSf ?? 0;
  const stabilizedRevenue =
    input.leasedRevenue > 0 ? input.leasedRevenue : input.grossArea * rentPerSf;
  const vacancyLoss = stabilizedRevenue * vacancyPct;
  const effectiveGrossIncome =
    stabilizedRevenue - vacancyLoss + (input.assumptions.income?.otherIncome ?? 0);
  const managementFee =
    effectiveGrossIncome * asPercent(input.assumptions.expenses?.managementFeePct ?? null, 0.05);
  const operatingExpenses =
    input.grossArea * (input.assumptions.expenses?.opexPerSf ?? 0) +
    input.grossArea * (input.assumptions.expenses?.insurance ?? 0) +
    input.grossArea * (input.assumptions.expenses?.taxes ?? 0) +
    managementFee;

  return {
    annualNoi: effectiveGrossIncome - operatingExpenses,
    effectiveGrossIncome,
    operatingExpenses,
    stabilizedRevenue,
    vacancyLoss,
  };
}

async function loadAcquisitionSnapshot(orgId: string, dealId: string) {
  return prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: {
      primaryAsset: true,
      terms: true,
      financings: {
        orderBy: [{ fundedDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
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
      outcome: true,
    },
  });
}

type AcquisitionDcfSummary = {
  dealId: string;
  dealName: string;
  strategy: string | null;
  marketName: string | null;
  holdYears: number;
  exitCapRate: number | null;
  rentGrowthPct: number | null;
  purchasePrice: number | null;
  annualNoi: number | null;
  annualDebtService: number | null;
  exitValue: number | null;
  remainingBalance: number | null;
  leveredIrrPct: number | null;
  equityMultiple: number | null;
  cashFlowSeries: Array<{ year: number; cashFlow: number | null }>;
};

async function buildAcquisitionDcfSummary(params: {
  orgId: string;
  dealId: string;
  holdYears: number | null;
  exitCapRate: number | null;
  rentGrowthPct: number | null;
}): Promise<AcquisitionDcfSummary | { error: string }> {
  const deal = await loadAcquisitionSnapshot(params.orgId, params.dealId);
  if (!deal) {
    return { error: "Deal not found or access denied." };
  }

  const assumptions = toAssumptions(deal.financialModelAssumptions);
  const grossArea = resolveArea(deal.primaryAsset?.sfGross, deal.primaryAsset?.sfNet, assumptions);
  const leasedRevenue = annualizedRentFromLeases(deal.tenantLeases);
  const noiView = deriveAnnualNoi({ assumptions, grossArea, leasedRevenue });
  const purchasePrice =
    toNumber(deal.terms?.offerPrice) ??
    assumptions.acquisition?.purchasePrice ??
    0;
  const modelHoldYears = Math.max(
    Math.round(params.holdYears ?? assumptions.exit?.holdYears ?? 5),
    1,
  );
  const normalizedExitCapRate = asPercent(
    params.exitCapRate ?? assumptions.exit?.exitCapRate ?? null,
    0.075,
  );
  const normalizedGrowth = asPercent(
    params.rentGrowthPct ?? assumptions.income?.rentGrowthPct ?? null,
    0.02,
  );
  const latestFinancing = deal.financings[0] ?? null;
  const loanAmount =
    toNumber(latestFinancing?.loanAmount) ??
    purchasePrice * asPercent(assumptions.financing?.ltvPct ?? null, 0.65);
  const annualDebtService = estimateAnnualDebtService(
    loanAmount,
    toNumber(latestFinancing?.interestRate) ?? assumptions.financing?.interestRate ?? null,
    latestFinancing?.amortizationYears ?? assumptions.financing?.amortizationYears ?? null,
  );
  const initialEquity = Math.max(purchasePrice - loanAmount, 0);

  const leveredCashFlows: number[] = [-initialEquity];
  for (let year = 1; year <= modelHoldYears; year += 1) {
    const annualNoi = noiView.annualNoi * Math.pow(1 + normalizedGrowth, year - 1);
    leveredCashFlows.push(annualNoi - annualDebtService);
  }

  const exitNoi = noiView.annualNoi * Math.pow(1 + normalizedGrowth, modelHoldYears);
  const exitValue = normalizedExitCapRate > 0 ? exitNoi / normalizedExitCapRate : 0;
  const remainingBalance = estimateRemainingBalance(
    loanAmount,
    asPercent(
      toNumber(latestFinancing?.interestRate) ?? assumptions.financing?.interestRate ?? null,
      0.065,
    ),
    latestFinancing?.amortizationYears ?? assumptions.financing?.amortizationYears ?? 30,
    modelHoldYears,
  );
  leveredCashFlows[leveredCashFlows.length - 1] += exitValue - remainingBalance;

  const irr = computeIrr(leveredCashFlows);
  const equityMultiple =
    initialEquity > 0
      ? leveredCashFlows.slice(1).reduce((sum, value) => sum + value, 0) / initialEquity
      : null;

  return {
    dealId: deal.id,
    dealName: deal.name,
    strategy: deal.strategy,
    marketName: deal.marketName,
    holdYears: modelHoldYears,
    exitCapRate: round(normalizedExitCapRate * 100, 2),
    rentGrowthPct: round(normalizedGrowth * 100, 2),
    purchasePrice: round(purchasePrice, 0),
    annualNoi: round(noiView.annualNoi, 0),
    annualDebtService: round(annualDebtService, 0),
    exitValue: round(exitValue, 0),
    remainingBalance: round(remainingBalance, 0),
    leveredIrrPct: round(irr !== null ? irr * 100 : null, 2),
    equityMultiple: round(equityMultiple, 2),
    cashFlowSeries: leveredCashFlows.map((value, index) => ({
      year: index,
      cashFlow: round(value, 0),
    })),
  };
}

export const acquisition_dcf_analysis = tool({
  name: "acquisition_dcf_analysis",
  description:
    "Build a lightweight DCF snapshot for an acquisition using stored deal assumptions, in-place rent roll, and current financing.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
    holdYears: z.number().nullable().describe("Override hold period in years, or null to use stored assumptions."),
    exitCapRate: z.number().nullable().describe("Override exit cap rate as a percent or decimal, or null to use stored assumptions."),
    rentGrowthPct: z.number().nullable().describe("Override annual rent growth as a percent or decimal, or null to use stored assumptions."),
  }),
  execute: async ({ orgId, dealId, holdYears, exitCapRate, rentGrowthPct }) => {
    return JSON.stringify(
      await buildAcquisitionDcfSummary({
        orgId,
        dealId,
        holdYears,
        exitCapRate,
        rentGrowthPct,
      }),
    );
  },
});

export const acquisition_cap_rate_evaluation = tool({
  name: "acquisition_cap_rate_evaluation",
  description:
    "Evaluate going-in cap rate, stabilized cap rate, debt yield, and basis against the current acquisition assumptions.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await loadAcquisitionSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const assumptions = toAssumptions(deal.financialModelAssumptions);
    const grossArea = resolveArea(deal.primaryAsset?.sfGross, deal.primaryAsset?.sfNet, assumptions);
    const leasedRevenue = annualizedRentFromLeases(deal.tenantLeases);
    const noiView = deriveAnnualNoi({ assumptions, grossArea, leasedRevenue });
    const purchasePrice =
      toNumber(deal.terms?.offerPrice) ??
      assumptions.acquisition?.purchasePrice ??
      0;
    const closingCosts =
      purchasePrice * asPercent(assumptions.acquisition?.closingCostsPct ?? null, 0.02);
    const basis = purchasePrice + closingCosts;
    const loanAmount =
      toNumber(deal.financings[0]?.loanAmount) ??
      purchasePrice * asPercent(assumptions.financing?.ltvPct ?? null, 0.65);

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      purchasePrice: round(purchasePrice, 0),
      basis: round(basis, 0),
      annualNoi: round(noiView.annualNoi, 0),
      effectiveGrossIncome: round(noiView.effectiveGrossIncome, 0),
      operatingExpenses: round(noiView.operatingExpenses, 0),
      goingInCapRatePct: round(purchasePrice > 0 ? (noiView.annualNoi / purchasePrice) * 100 : null, 2),
      stabilizedCapRatePct: round(basis > 0 ? (noiView.annualNoi / basis) * 100 : null, 2),
      debtYieldPct: round(loanAmount > 0 ? (noiView.annualNoi / loanAmount) * 100 : null, 2),
      vacancyLoss: round(noiView.vacancyLoss, 0),
      annualizedRentPsf: round(grossArea > 0 ? noiView.stabilizedRevenue / grossArea : null, 2),
    });
  },
});

export const acquisition_rent_roll_analysis = tool({
  name: "acquisition_rent_roll_analysis",
  description:
    "Analyze in-place leases for occupancy, weighted average rent, rollover timing, and tenant concentration risk before acquisition.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
    monthsForward: z.number().nullable().describe("Look-forward window for rollover analysis, or null to default to 24 months."),
  }),
  execute: async ({ orgId, dealId, monthsForward }) => {
    const deal = await loadAcquisitionSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const assumptions = toAssumptions(deal.financialModelAssumptions);
    const grossArea = resolveArea(deal.primaryAsset?.sfGross, deal.primaryAsset?.sfNet, assumptions);
    const horizonMonths = monthsForward ?? 24;
    const horizonDays = horizonMonths * 30;

    const leaseRows = deal.tenantLeases.map((lease) => {
      const area = toNumber(lease.rentedAreaSf) ?? 0;
      const rentPerSf = toNumber(lease.rentPerSf) ?? 0;
      return {
        tenantName: lease.tenant?.name ?? "Unknown tenant",
        leaseName: lease.leaseName,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        annualBaseRent: round(area * rentPerSf, 0),
        rentedAreaSf: round(area, 2),
        rentPerSf: round(rentPerSf, 2),
        escalationPct: round(toNumber(lease.annualEscalationPct), 2),
        daysToExpiry: daysUntil(lease.endDate),
      };
    });

    const occupiedSf = leaseRows.reduce((sum, row) => sum + (row.rentedAreaSf ?? 0), 0);
    const annualBaseRent = leaseRows.reduce((sum, row) => sum + (row.annualBaseRent ?? 0), 0);
    const rolloverWithinWindow = leaseRows.filter((row) => {
      const daysToExpiry = row.daysToExpiry;
      return daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= horizonDays;
    });

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      leaseCount: leaseRows.length,
      occupiedSf: round(occupiedSf, 2),
      vacantSf: round(Math.max(grossArea - occupiedSf, 0), 2),
      occupancyPct: round(grossArea > 0 ? (occupiedSf / grossArea) * 100 : null, 2),
      weightedAverageRentPsf: round(occupiedSf > 0 ? annualBaseRent / occupiedSf : null, 2),
      annualBaseRent: round(annualBaseRent, 0),
      rolloverWindowMonths: horizonMonths,
      rolloverCount: rolloverWithinWindow.length,
      rolloverSf: round(
        rolloverWithinWindow.reduce((sum, row) => sum + (row.rentedAreaSf ?? 0), 0),
        2,
      ),
      leases: leaseRows,
    });
  },
});

export const acquisition_internal_comparable_sales = tool({
  name: "acquisition_internal_comparable_sales",
  description:
    "Summarize recent internal comparable sale outcomes for similarly classified deals in the same organization and market.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to compare."),
    limit: z.number().nullable().describe("Maximum internal comparables to return, or null to default to 5."),
  }),
  execute: async ({ orgId, dealId, limit }) => {
    const deal = await loadAcquisitionSnapshot(orgId, dealId);
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied." });
    }

    const comparableOutcomes = await prisma.dealOutcome.findMany({
      where: {
        actualPurchasePrice: { not: null },
        deal: {
          is: {
            orgId,
            id: { not: dealId },
            ...(deal.assetClass ? { assetClass: deal.assetClass } : {}),
            ...(deal.marketName ? { marketName: deal.marketName } : {}),
          },
        },
      },
      take: limit ?? 5,
      orderBy: [{ exitDate: "desc" }, { createdAt: "desc" }],
      select: {
        actualPurchasePrice: true,
        actualNoiYear1: true,
        actualExitPrice: true,
        actualIrr: true,
        actualEquityMultiple: true,
        deal: {
          select: {
            id: true,
            name: true,
            marketName: true,
            assetClass: true,
            primaryAsset: {
              select: {
                sfGross: true,
              },
            },
          },
        },
      },
    });

    const rows = comparableOutcomes.map((outcome) => {
      const purchasePrice = toNumber(outcome.actualPurchasePrice) ?? 0;
      const noi = toNumber(outcome.actualNoiYear1);
      const sfGross = toNumber(outcome.deal.primaryAsset?.sfGross);
      return {
        dealId: outcome.deal.id,
        dealName: outcome.deal.name,
        marketName: outcome.deal.marketName,
        assetClass: outcome.deal.assetClass,
        purchasePrice: round(purchasePrice, 0),
        purchasePsf: round(sfGross && sfGross > 0 ? purchasePrice / sfGross : null, 2),
        goingInCapRatePct: round(
          purchasePrice > 0 && noi !== null ? (noi / purchasePrice) * 100 : null,
          2,
        ),
        exitPrice: round(toNumber(outcome.actualExitPrice), 0),
        realizedIrrPct: round(
          (() => {
            const irr = toNumber(outcome.actualIrr);
            return irr === null ? null : asPercent(irr, 0) * 100;
          })(),
          2,
        ),
        realizedEquityMultiple: round(toNumber(outcome.actualEquityMultiple), 2),
      };
    });

    const capRateSamples = rows
      .map((row) => row.goingInCapRatePct)
      .filter((value): value is number => value !== null);
    const avgCapRate =
      capRateSamples.length > 0
        ? capRateSamples.reduce((sum, value) => sum + value, 0) / capRateSamples.length
        : null;

    return JSON.stringify({
      dealId: deal.id,
      dealName: deal.name,
      comparableCount: rows.length,
      averageGoingInCapRatePct: round(avgCapRate, 2),
      comparables: rows,
    });
  },
});

export const acquisition_investment_returns = tool({
  name: "acquisition_investment_returns",
  description:
    "Summarize leveraged investment return metrics, equity requirement, and downside spread to the stored acquisition plan.",
  parameters: z.object({
    orgId: z.string().describe("Organization ID for multi-tenant scoping."),
    dealId: z.string().describe("Deal ID to analyze."),
  }),
  execute: async ({ orgId, dealId }) => {
    const dcf = await buildAcquisitionDcfSummary({
      orgId,
      dealId,
      holdYears: null,
      exitCapRate: null,
      rentGrowthPct: null,
    });
    if ("error" in dcf) {
      return JSON.stringify(dcf);
    }

    const purchasePrice = dcf.purchasePrice ?? 0;
    const annualNoi = dcf.annualNoi ?? 0;
    const annualDebtService = dcf.annualDebtService ?? 0;
    const yearOneCashYield =
      purchasePrice > 0 ? ((annualNoi - annualDebtService) / purchasePrice) * 100 : null;

    return JSON.stringify({
      dealId,
      leveredIrrPct: round(dcf.leveredIrrPct ?? null, 2),
      equityMultiple: round(dcf.equityMultiple ?? null, 2),
      yearOneCashYieldPct: round(yearOneCashYield, 2),
      spreadToTargetIrrPct:
        dcf.leveredIrrPct === null || dcf.leveredIrrPct === undefined
          ? null
          : round(dcf.leveredIrrPct - 18, 2),
      holdYears: dcf.holdYears ?? null,
      annualNoi: round(annualNoi, 0),
      annualDebtService: round(annualDebtService, 0),
    });
  },
});
