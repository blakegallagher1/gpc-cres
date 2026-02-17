export type RentRollLeaseInput = {
  id?: string;
  tenantId: string;
  leaseName?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  rentedAreaSf: number;
  rentPerSf: number;
  annualEscalationPct: number;
};

export type RentRollYearSchedule = {
  year: number;
  periodStart: string;
  periodEnd: string;
  contractedRevenue: number;
  rolloverRevenue: number;
  vacancyLoss: number;
  totalRevenue: number;
};

export type RentRollAggregation = {
  hasLeases: boolean;
  totalRentedAreaSf: number;
  weightedAverageLeaseTermYears: number;
  annualSchedule: RentRollYearSchedule[];
  yearOneRevenue: number;
};

export type DevelopmentBudgetLineItemInput = {
  name: string;
  category: "hard" | "soft" | "other";
  amount: number;
};

export type DevelopmentBudgetContingenciesInput = {
  hardCostContingencyPct?: number;
  softCostContingencyPct?: number;
  otherCostContingencyPct?: number;
};

export type DevelopmentBudgetCalcInput = {
  lineItems: DevelopmentBudgetLineItemInput[];
  contingencies?: DevelopmentBudgetContingenciesInput;
};

export type DevelopmentBudgetSummary = {
  hardCosts: number;
  softCosts: number;
  otherCosts: number;
  lineItemsTotal: number;
  hardContingencyAmount: number;
  softContingencyAmount: number;
  otherContingencyAmount: number;
  totalContingency: number;
  totalBudget: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function toUtcDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid lease date");
  }
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

function addYears(date: Date, years: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function overlapDays(startA: Date, endA: Date, startB: Date, endB: Date): number {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  if (end <= start) {
    return 0;
  }
  return (end - start) / MS_PER_DAY;
}

function safeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export function summarizeDevelopmentBudget(
  budget: DevelopmentBudgetCalcInput,
): DevelopmentBudgetSummary {
  const hardCosts = budget.lineItems
    .filter((item) => item.category === "hard")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const softCosts = budget.lineItems
    .filter((item) => item.category === "soft")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const otherCosts = budget.lineItems
    .filter((item) => item.category === "other")
    .reduce((sum, item) => sum + safeNumber(item.amount), 0);

  const hardPct = safeNumber(budget.contingencies?.hardCostContingencyPct ?? 0);
  const softPct = safeNumber(budget.contingencies?.softCostContingencyPct ?? 0);
  const otherPct = safeNumber(budget.contingencies?.otherCostContingencyPct ?? 0);

  const hardContingencyAmount = hardCosts * (hardPct / 100);
  const softContingencyAmount = softCosts * (softPct / 100);
  const otherContingencyAmount = otherCosts * (otherPct / 100);

  const lineItemsTotal = hardCosts + softCosts + otherCosts;
  const totalContingency =
    hardContingencyAmount + softContingencyAmount + otherContingencyAmount;

  return {
    hardCosts: round(hardCosts),
    softCosts: round(softCosts),
    otherCosts: round(otherCosts),
    lineItemsTotal: round(lineItemsTotal),
    hardContingencyAmount: round(hardContingencyAmount),
    softContingencyAmount: round(softContingencyAmount),
    otherContingencyAmount: round(otherContingencyAmount),
    totalContingency: round(totalContingency),
    totalBudget: round(lineItemsTotal + totalContingency),
  };
}

export function aggregateRentRoll(input: {
  leases: RentRollLeaseInput[];
  holdYears: number;
  marketRentPerSf: number;
  marketVacancyPct: number;
  analysisStartDate?: Date | string;
}): RentRollAggregation {
  const { leases, holdYears, marketRentPerSf, marketVacancyPct, analysisStartDate } = input;
  const normalizedHoldYears = Math.max(1, Math.min(30, Math.floor(holdYears)));
  const analysisStart = analysisStartDate
    ? toUtcDate(analysisStartDate)
    : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  if (leases.length === 0) {
    const annualSchedule: RentRollYearSchedule[] = [];
    for (let year = 1; year <= normalizedHoldYears; year++) {
      const periodStart = addYears(analysisStart, year - 1);
      const periodEnd = addYears(analysisStart, year);
      annualSchedule.push({
        year,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        contractedRevenue: 0,
        rolloverRevenue: 0,
        vacancyLoss: 0,
        totalRevenue: 0,
      });
    }

    return {
      hasLeases: false,
      totalRentedAreaSf: 0,
      weightedAverageLeaseTermYears: 0,
      annualSchedule,
      yearOneRevenue: 0,
    };
  }

  let totalArea = 0;
  let weightedYears = 0;

  for (const lease of leases) {
    const leaseEnd = toUtcDate(lease.endDate);
    const remainingDays = Math.max((leaseEnd.getTime() - analysisStart.getTime()) / MS_PER_DAY, 0);
    totalArea += safeNumber(lease.rentedAreaSf);
    weightedYears += (remainingDays / 365) * safeNumber(lease.rentedAreaSf);
  }

  const annualSchedule: RentRollYearSchedule[] = [];

  for (let year = 1; year <= normalizedHoldYears; year++) {
    const periodStart = addYears(analysisStart, year - 1);
    const periodEnd = addYears(analysisStart, year);
    const periodDays = Math.max((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY, 1);

    let contractedRevenue = 0;
    let rolloverPotentialRevenue = 0;

    for (const lease of leases) {
      const leaseStart = toUtcDate(lease.startDate);
      const leaseEndExclusive = addDays(toUtcDate(lease.endDate), 1);

      const activeDays = overlapDays(leaseStart, leaseEndExclusive, periodStart, periodEnd);
      if (activeDays > 0) {
        const yearsSinceLeaseStart = Math.max(
          0,
          periodStart.getUTCFullYear() - leaseStart.getUTCFullYear(),
        );
        const escalatedRentPerSf =
          safeNumber(lease.rentPerSf) *
          Math.pow(1 + safeNumber(lease.annualEscalationPct) / 100, yearsSinceLeaseStart);
        const annualRent = safeNumber(lease.rentedAreaSf) * escalatedRentPerSf;
        contractedRevenue += annualRent * (activeDays / periodDays);
      }

      const rolloverStart = leaseEndExclusive > periodStart ? leaseEndExclusive : periodStart;
      const rolloverDays = overlapDays(rolloverStart, periodEnd, periodStart, periodEnd);
      if (rolloverDays > 0) {
        const annualMarketRent = safeNumber(lease.rentedAreaSf) * safeNumber(marketRentPerSf);
        rolloverPotentialRevenue += annualMarketRent * (rolloverDays / periodDays);
      }
    }

    const vacancyLoss = rolloverPotentialRevenue * (safeNumber(marketVacancyPct) / 100);
    const rolloverRevenue = rolloverPotentialRevenue - vacancyLoss;
    const totalRevenue = contractedRevenue + rolloverRevenue;

    annualSchedule.push({
      year,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      contractedRevenue: round(contractedRevenue),
      rolloverRevenue: round(rolloverRevenue),
      vacancyLoss: round(vacancyLoss),
      totalRevenue: round(totalRevenue),
    });
  }

  return {
    hasLeases: true,
    totalRentedAreaSf: round(totalArea),
    weightedAverageLeaseTermYears: totalArea > 0 ? round(weightedYears / totalArea, 2) : 0,
    annualSchedule,
    yearOneRevenue: annualSchedule[0]?.totalRevenue ?? 0,
  };
}
