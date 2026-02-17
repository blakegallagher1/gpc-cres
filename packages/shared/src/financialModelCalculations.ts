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

export type DepreciationPropertyType =
  | "commercial_building"
  | "land_improvements"
  | "personal_property"
  | "equipment";

export type CostSegregationPropertyType =
  | "SMALL_BAY_FLEX"
  | "OUTDOOR_STORAGE"
  | "TRUCK_PARKING";

export type DepreciationScheduleEntry = {
  year: number;
  deduction: number;
  accumulated: number;
  remainingBasis: number;
};

export type DepreciationScheduleResult = {
  schedule: DepreciationScheduleEntry[];
  method: string;
  recoveryPeriodYears: number;
  totalDepreciableBasis: number;
  typicalAnnualDeduction: number;
};

export type CostSegregationEstimate = {
  personalPropertyPct: number;
  landImprovementsPct: number;
  buildingPct: number;
  estimatedFirstYearDeduction: number;
  withoutCostSegFirstYear: number;
  estimatedNpvBenefit: number;
};

export type Exchange1031Deadlines = {
  saleCloseDate: string;
  identificationDeadline: string;
  closingDeadline: string;
  daysRemainingIdentification: number;
  daysRemainingClosing: number;
  isIdentificationExpired: boolean;
  isClosingExpired: boolean;
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

function toUtcDateInput(value: Date | string, label: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}`);
  }
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

function formatIsoDateOnly(value: Date): string {
  return value.toISOString().split("T")[0] ?? "";
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

export function calculateDepreciationSchedule(input: {
  costBasis: number;
  propertyType: DepreciationPropertyType;
  placedInServiceYear: number;
  projectionYears?: number;
}): DepreciationScheduleResult {
  const recoveryPeriods: Record<DepreciationPropertyType, number> = {
    commercial_building: 39,
    land_improvements: 15,
    personal_property: 7,
    equipment: 5,
  };

  const period = recoveryPeriods[input.propertyType] ?? 39;
  const method =
    period >= 15
      ? "Straight-Line (MACRS)"
      : "200% Declining Balance (MACRS)";
  const costBasis = Math.max(safeNumber(input.costBasis), 0);
  const annualDeduction =
    period >= 15 ? costBasis / period : (costBasis * 2) / period;
  const projectionYears = Math.max(
    1,
    Math.floor(safeNumber(input.projectionYears ?? 10)),
  );
  const placedInServiceYear = Math.max(
    1900,
    Math.floor(safeNumber(input.placedInServiceYear)),
  );

  const schedule: DepreciationScheduleEntry[] = [];
  let accumulated = 0;
  for (let y = 0; y < Math.min(period, projectionYears); y++) {
    let deduction: number;
    if (period >= 15) {
      deduction = y === 0 ? costBasis / period / 2 : costBasis / period;
    } else {
      const remainingBasis = Math.max(costBasis - accumulated, 0);
      deduction = Math.min(remainingBasis * (2 / period), remainingBasis);
    }
    accumulated += deduction;
    schedule.push({
      year: placedInServiceYear + y,
      deduction: round(deduction, 0),
      accumulated: round(accumulated, 0),
      remainingBasis: round(Math.max(costBasis - accumulated, 0), 0),
    });
  }

  return {
    schedule,
    method,
    recoveryPeriodYears: period,
    totalDepreciableBasis: costBasis,
    typicalAnnualDeduction: round(annualDeduction, 0),
  };
}

export function calculateCostSegregationEstimate(input: {
  totalBasis: number;
  propertyType: CostSegregationPropertyType;
}): CostSegregationEstimate {
  const allocations: Record<
    CostSegregationPropertyType,
    { personal: number; landImp: number; building: number }
  > = {
    SMALL_BAY_FLEX: { personal: 15, landImp: 20, building: 65 },
    OUTDOOR_STORAGE: { personal: 5, landImp: 60, building: 35 },
    TRUCK_PARKING: { personal: 3, landImp: 70, building: 27 },
  };

  const alloc = allocations[input.propertyType] ?? allocations.SMALL_BAY_FLEX;
  const totalBasis = Math.max(safeNumber(input.totalBasis), 0);
  const personalBasis = totalBasis * (alloc.personal / 100);
  const landImpBasis = totalBasis * (alloc.landImp / 100);
  const buildingBasis = totalBasis * (alloc.building / 100);

  const bonusDepreciation = personalBasis * 0.6;
  const landImpFirstYear = landImpBasis / 15;
  const buildingFirstYear = buildingBasis / 39 / 2;
  const totalFirstYear = bonusDepreciation + landImpFirstYear + buildingFirstYear;

  const withoutFirstYear = totalBasis / 39 / 2;
  const npvBenefit = (totalFirstYear - withoutFirstYear) * 0.37;

  return {
    personalPropertyPct: alloc.personal,
    landImprovementsPct: alloc.landImp,
    buildingPct: alloc.building,
    estimatedFirstYearDeduction: round(totalFirstYear, 0),
    withoutCostSegFirstYear: round(withoutFirstYear, 0),
    estimatedNpvBenefit: round(npvBenefit, 0),
  };
}

export function calculate1031Deadlines(input: {
  saleCloseDate: Date | string;
  asOfDate?: Date | string;
}): Exchange1031Deadlines {
  const saleDate = toUtcDateInput(input.saleCloseDate, "sale close date");
  const asOfDate = input.asOfDate
    ? toUtcDateInput(input.asOfDate, "as-of date")
    : toUtcDateInput(new Date(), "as-of date");

  const identificationDeadline = addDays(saleDate, 45);
  const closingDeadline = addDays(saleDate, 180);

  const daysRemainingIdentification = Math.ceil(
    (identificationDeadline.getTime() - asOfDate.getTime()) / MS_PER_DAY,
  );
  const daysRemainingClosing = Math.ceil(
    (closingDeadline.getTime() - asOfDate.getTime()) / MS_PER_DAY,
  );

  return {
    saleCloseDate: formatIsoDateOnly(saleDate),
    identificationDeadline: formatIsoDateOnly(identificationDeadline),
    closingDeadline: formatIsoDateOnly(closingDeadline),
    daysRemainingIdentification: Math.max(daysRemainingIdentification, 0),
    daysRemainingClosing: Math.max(daysRemainingClosing, 0),
    isIdentificationExpired: daysRemainingIdentification < 0,
    isClosingExpired: daysRemainingClosing < 0,
  };
}
