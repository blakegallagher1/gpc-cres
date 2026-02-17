import { useMemo } from "react";
import {
  aggregateRentRoll,
  summarizeDevelopmentBudget,
  type DevelopmentBudgetCalcInput,
  type RentRollAggregation,
  type RentRollLeaseInput,
} from "@entitlement-os/shared";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";

// ---------------------------------------------------------------------------
// Core financial math — wraps the same logic from calculationTools.ts
// These are pure functions extracted so the UI never needs to import the
// agent SDK. The math is identical to calculate_proforma / calculate_debt_sizing.
// ---------------------------------------------------------------------------

function computeIRR(
  cashflows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 0.0001
): number | null {
  if (cashflows.length === 0) return null;
  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!(hasPositive && hasNegative)) return null;

  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < tolerance) return rate;
    if (dnpv === 0) break;
    rate -= npv / dnpv;
  }
  return rate;
}

export function estimateRemainingBalance(
  principal: number,
  annualRate: number,
  amortYears: number,
  yearsElapsed: number
): number {
  const monthlyRate = annualRate / 12;
  const totalPayments = amortYears * 12;
  const paymentsMade = yearsElapsed * 12;
  if (monthlyRate === 0) {
    return Math.max(principal - (principal / totalPayments) * paymentsMade, 0);
  }
  const monthlyPayment =
    principal *
    ((monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1));
  const balance =
    principal * Math.pow(1 + monthlyRate, paymentsMade) -
    (monthlyPayment * (Math.pow(1 + monthlyRate, paymentsMade) - 1)) /
      monthlyRate;
  return Math.max(balance, 0);
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AnnualCashFlow {
  year: number;
  noi: number;
  debtService: number;
  leveredCashFlow: number;
  cumulativeCashFlow: number;
  cashOnCash: number;
}

export interface AcquisitionBasis {
  purchasePrice: number;
  closingCosts: number;
  developmentCosts: number;
  loanFees: number;
  totalBasis: number;
  loanAmount: number;
  equityRequired: number;
}

export interface ExitAnalysis {
  exitNoi: number;
  salePrice: number;
  dispositionCosts: number;
  loanPayoff: number;
  netProceeds: number;
  profit: number;
}

export interface ProFormaContext {
  tenantLeases?: RentRollLeaseInput[];
  developmentBudget?: DevelopmentBudgetCalcInput | null;
  capitalSources?: Array<{
    sourceKind: string;
    amount: number;
  }>;
}

export interface SourcesAndUsesSummary {
  totalUses: number;
  totalSources: number;
  debtSources: number;
  equitySources: number;
  otherSources: number;
  usesDelta: number;
}

export interface ProFormaResults {
  acquisitionBasis: AcquisitionBasis;
  annualCashFlows: AnnualCashFlow[];
  exitAnalysis: ExitAnalysis;
  leveredIRR: number | null;
  unleveredIRR: number | null;
  equityMultiple: number;
  cashOnCashYear1: number;
  netProfit: number;
  goingInCapRate: number;
  annualDebtService: number;
  dscr: number;
  weightedAverageLeaseTermYears: number;
  rentRoll: RentRollAggregation;
  developmentBudgetSummary: ReturnType<typeof summarizeDevelopmentBudget>;
  sourcesAndUses: SourcesAndUsesSummary;
}

export type ExitScenarioPath =
  | "sell"
  | "refinance_hold"
  | "stabilization_disposition";

export interface ExitScenarioTiming {
  sellYear: number;
  refinanceYear: number | null;
  exitYear: number;
}

export interface ExitScenarioResult {
  id: string;
  label: string;
  path: ExitScenarioPath;
  timing: ExitScenarioTiming;
  exitValue: number;
  equityProceeds: number;
  equityMultiple: number;
  irr: number | null;
  irrMaximizingExitTiming: ExitScenarioTiming;
}

export interface ExitScenarioAnalysis {
  scenarios: ExitScenarioResult[];
  rankedScenarios: ExitScenarioResult[];
  sellStrategy: {
    bestTiming: ExitScenarioTiming | null;
    bestIrr: number | null;
  };
  refinanceStrategy: {
    bestTiming: ExitScenarioTiming | null;
    bestIrr: number | null;
  };
  stabilizationStrategy: {
    timing: ExitScenarioTiming;
    irr: number | null;
  };
  overallBestScenarioId: string | null;
}

type OperatingScenarioInputs = {
  equityRequired: number;
  initialLoanAmount: number;
  rate: number;
  annualDebtService: number;
  ioAnnualDebtService: number;
  loanFeePct: number;
  amortizationYears: number;
  ioPeriodYears: number;
  exitCapRatePct: number;
  dispositionCostsPct: number;
  yearNoi: number[];
};

// ---------------------------------------------------------------------------
// Pure calculation function — used by hook AND by sensitivity/tornado analysis
// ---------------------------------------------------------------------------

export function computeProForma(
  assumptions: FinancialModelAssumptions,
  context?: ProFormaContext
): ProFormaResults {
  const { acquisition, income, expenses, financing, exit, buildableSf } =
    assumptions;

  const developmentBudgetSummary = summarizeDevelopmentBudget(
    context?.developmentBudget ?? { lineItems: [], contingencies: {} }
  );

  const holdYears = Math.max(1, Math.min(exit.holdYears, 30));
  const rentRoll = aggregateRentRoll({
    leases: context?.tenantLeases ?? [],
    holdYears,
    marketRentPerSf: income.rentPerSf,
    marketVacancyPct: income.vacancyPct,
  });

  // --- Acquisition Basis ---
  const closingCosts =
    acquisition.purchasePrice * (acquisition.closingCostsPct / 100);
  const basisBeforeDebt =
    acquisition.purchasePrice +
    closingCosts +
    developmentBudgetSummary.totalBudget;
  const loanAmount = basisBeforeDebt * (financing.ltvPct / 100);
  const loanFees = loanAmount * (financing.loanFeePct / 100);
  const totalBasis = basisBeforeDebt + loanFees;
  const equityRequired = totalBasis - loanAmount;

  const acquisitionBasis: AcquisitionBasis = {
    purchasePrice: acquisition.purchasePrice,
    closingCosts: round(closingCosts, 0),
    developmentCosts: round(developmentBudgetSummary.totalBudget, 0),
    loanFees: round(loanFees, 0),
    totalBasis: round(totalBasis, 0),
    loanAmount: round(loanAmount, 0),
    equityRequired: round(equityRequired, 0),
  };

  const capitalSources = context?.capitalSources ?? [];
  const hasCapitalSources = capitalSources.length > 0;
  const debtSources = capitalSources
    .filter((source) => source.sourceKind === "DEBT" || source.sourceKind === "MEZZ")
    .reduce((sum, source) => sum + source.amount, 0);
  const equitySources = capitalSources
    .filter(
      (source) =>
        source.sourceKind === "LP_EQUITY" ||
        source.sourceKind === "GP_EQUITY" ||
        source.sourceKind === "PREF_EQUITY",
    )
    .reduce((sum, source) => sum + source.amount, 0);
  const otherSources = capitalSources
    .filter(
      (source) =>
        source.sourceKind !== "DEBT" &&
        source.sourceKind !== "MEZZ" &&
        source.sourceKind !== "LP_EQUITY" &&
        source.sourceKind !== "GP_EQUITY" &&
        source.sourceKind !== "PREF_EQUITY",
    )
    .reduce((sum, source) => sum + source.amount, 0);
  const modeledTotalSources = loanAmount + equityRequired;
  const capitalStackSources = debtSources + equitySources + otherSources;
  const totalSources = hasCapitalSources ? capitalStackSources : modeledTotalSources;
  const totalUses = totalBasis;
  const sourcesAndUses: SourcesAndUsesSummary = {
    totalUses: round(totalUses, 0),
    totalSources: round(totalSources, 0),
    debtSources: round(hasCapitalSources ? debtSources : loanAmount, 0),
    equitySources: round(hasCapitalSources ? equitySources : equityRequired, 0),
    otherSources: round(hasCapitalSources ? otherSources : 0, 0),
    usesDelta: round(totalSources - totalUses, 0),
  };

  // --- Income & NOI ---
  const grossPotentialRent = rentRoll.hasLeases
    ? rentRoll.yearOneRevenue
    : buildableSf * income.rentPerSf;

  const effectiveGrossIncome = rentRoll.hasLeases
    ? grossPotentialRent + income.otherIncome
    : grossPotentialRent * (1 - income.vacancyPct / 100) + income.otherIncome;

  const totalOpex =
    buildableSf * expenses.opexPerSf +
    effectiveGrossIncome * (expenses.managementFeePct / 100) +
    buildableSf * expenses.capexReserves +
    buildableSf * expenses.insurance +
    buildableSf * expenses.taxes;

  const baseNoi = effectiveGrossIncome - totalOpex;

  // --- Debt Service ---
  const rate = financing.interestRate / 100;
  let annualDebtService = 0;
  if (loanAmount > 0 && rate > 0 && financing.amortizationYears > 0) {
    const monthlyRate = rate / 12;
    const numPayments = financing.amortizationYears * 12;
    const monthlyPayment =
      loanAmount *
      ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1));
    annualDebtService = monthlyPayment * 12;
  }
  const ioAnnualDebtService = loanAmount * rate;

  // Going-in cap rate
  const goingInCapRate = totalBasis > 0 ? baseNoi / totalBasis : 0;

  // DSCR
  const dscr = annualDebtService > 0 ? baseNoi / annualDebtService : Infinity;

  // --- Annual Cash Flows ---
  const leveredCFs: number[] = [-equityRequired];
  const unleveredCFs: number[] = [-totalBasis];
  const annualCashFlows: AnnualCashFlow[] = [];
  let cumulativeCF = 0;
  let finalYearNoi = baseNoi;

  for (let y = 1; y <= holdYears; y++) {
    const growthFactor = Math.pow(1 + income.rentGrowthPct / 100, y - 1);
    const yearLeaseRevenue =
      rentRoll.annualSchedule[y - 1]?.totalRevenue ??
      rentRoll.annualSchedule[rentRoll.annualSchedule.length - 1]?.totalRevenue ??
      0;

    const yearEgi = rentRoll.hasLeases
      ? yearLeaseRevenue + income.otherIncome * growthFactor
      : grossPotentialRent * growthFactor * (1 - income.vacancyPct / 100) +
        income.otherIncome * growthFactor;

    // Expenses grow at 2% annually
    const yearOpex = totalOpex * Math.pow(1.02, y - 1);
    const yearNoi = yearEgi - yearOpex;
    finalYearNoi = yearNoi;

    // IO period: interest only; otherwise full amortizing
    const yearDS =
      y <= financing.ioPeriodYears ? ioAnnualDebtService : annualDebtService;

    const leveredCF = yearNoi - yearDS;
    cumulativeCF += leveredCF;

    leveredCFs.push(leveredCF);
    unleveredCFs.push(yearNoi);

    annualCashFlows.push({
      year: y,
      noi: round(yearNoi, 0),
      debtService: round(yearDS, 0),
      leveredCashFlow: round(leveredCF, 0),
      cumulativeCashFlow: round(cumulativeCF, 0),
      cashOnCash: equityRequired > 0 ? round(leveredCF / equityRequired, 4) : 0,
    });
  }

  // --- Exit Analysis ---
  const exitNoi = rentRoll.hasLeases
    ? finalYearNoi
    : (grossPotentialRent * Math.pow(1 + income.rentGrowthPct / 100, holdYears) *
        (1 - income.vacancyPct / 100) +
        income.otherIncome * Math.pow(1 + income.rentGrowthPct / 100, holdYears)) -
      totalOpex * Math.pow(1.02, holdYears);

  const salePrice =
    exit.exitCapRate > 0 ? exitNoi / (exit.exitCapRate / 100) : 0;
  const dispositionCosts = salePrice * (exit.dispositionCostsPct / 100);
  const loanPayoff =
    loanAmount > 0
      ? estimateRemainingBalance(
          loanAmount,
          rate,
          financing.amortizationYears,
          holdYears
        )
      : 0;
  const netProceeds = salePrice - dispositionCosts - loanPayoff;

  const exitAnalysis: ExitAnalysis = {
    exitNoi: round(exitNoi, 0),
    salePrice: round(salePrice, 0),
    dispositionCosts: round(dispositionCosts, 0),
    loanPayoff: round(loanPayoff, 0),
    netProceeds: round(netProceeds, 0),
    profit: round(netProceeds + cumulativeCF - equityRequired, 0),
  };

  // Add exit proceeds to terminal year for IRR
  leveredCFs[holdYears] += netProceeds;
  unleveredCFs[holdYears] += salePrice - dispositionCosts;

  // --- Return Metrics ---
  const leveredIRR = computeIRR(leveredCFs);
  const unleveredIRR = computeIRR(unleveredCFs);

  const totalLeveredReturn = cumulativeCF + netProceeds;
  const equityMultiple =
    equityRequired > 0 ? totalLeveredReturn / equityRequired : 0;

  const cashOnCashYear1 =
    annualCashFlows.length > 0 ? annualCashFlows[0].cashOnCash : 0;

  const netProfit = totalLeveredReturn - equityRequired;

  return {
    acquisitionBasis,
    annualCashFlows,
    exitAnalysis,
    leveredIRR,
    unleveredIRR,
    equityMultiple: round(equityMultiple, 2),
    cashOnCashYear1,
    netProfit: round(netProfit, 0),
    goingInCapRate: round(goingInCapRate, 4),
    annualDebtService: round(annualDebtService, 0),
    dscr: round(dscr === Infinity ? 999 : dscr, 2),
    weightedAverageLeaseTermYears: rentRoll.weightedAverageLeaseTermYears,
    rentRoll,
    developmentBudgetSummary,
    sourcesAndUses,
  };
}

function computeAnnualDebtService(
  principal: number,
  annualRate: number,
  amortizationYears: number
): number {
  if (principal <= 0 || annualRate <= 0 || amortizationYears <= 0) {
    return 0;
  }
  const monthlyRate = annualRate / 12;
  const numPayments = amortizationYears * 12;
  const monthlyPayment =
    principal *
    ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1));
  return monthlyPayment * 12;
}

function scoreIrr(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

function toRoundedTiming(
  sellYear: number,
  refinanceYear: number | null,
  exitYear: number
): ExitScenarioTiming {
  return {
    sellYear: Math.round(sellYear),
    refinanceYear:
      refinanceYear === null ? null : Math.round(refinanceYear),
    exitYear: Math.round(exitYear),
  };
}

function buildOperatingScenarioInputs(
  assumptions: FinancialModelAssumptions,
  holdYears: number,
  context?: ProFormaContext
): OperatingScenarioInputs {
  const normalizedHoldYears = Math.max(1, Math.min(30, Math.floor(holdYears)));
  const { acquisition, income, expenses, financing, exit, buildableSf } =
    assumptions;

  const developmentBudgetSummary = summarizeDevelopmentBudget(
    context?.developmentBudget ?? { lineItems: [], contingencies: {} }
  );

  const rentRoll = aggregateRentRoll({
    leases: context?.tenantLeases ?? [],
    holdYears: normalizedHoldYears,
    marketRentPerSf: income.rentPerSf,
    marketVacancyPct: income.vacancyPct,
  });

  const closingCosts =
    acquisition.purchasePrice * (acquisition.closingCostsPct / 100);
  const basisBeforeDebt =
    acquisition.purchasePrice +
    closingCosts +
    developmentBudgetSummary.totalBudget;
  const initialLoanAmount = basisBeforeDebt * (financing.ltvPct / 100);
  const loanFees = initialLoanAmount * (financing.loanFeePct / 100);
  const totalBasis = basisBeforeDebt + loanFees;
  const equityRequired = totalBasis - initialLoanAmount;

  const grossPotentialRent = rentRoll.hasLeases
    ? rentRoll.yearOneRevenue
    : buildableSf * income.rentPerSf;
  const effectiveGrossIncome = rentRoll.hasLeases
    ? grossPotentialRent + income.otherIncome
    : grossPotentialRent * (1 - income.vacancyPct / 100) + income.otherIncome;
  const totalOpex =
    buildableSf * expenses.opexPerSf +
    effectiveGrossIncome * (expenses.managementFeePct / 100) +
    buildableSf * expenses.capexReserves +
    buildableSf * expenses.insurance +
    buildableSf * expenses.taxes;

  const rate = financing.interestRate / 100;
  const annualDebtService = computeAnnualDebtService(
    initialLoanAmount,
    rate,
    financing.amortizationYears
  );
  const ioAnnualDebtService = initialLoanAmount * rate;

  const yearNoi: number[] = [];
  for (let y = 1; y <= normalizedHoldYears; y++) {
    const growthFactor = Math.pow(1 + income.rentGrowthPct / 100, y - 1);
    const yearLeaseRevenue =
      rentRoll.annualSchedule[y - 1]?.totalRevenue ??
      rentRoll.annualSchedule[rentRoll.annualSchedule.length - 1]
        ?.totalRevenue ??
      0;
    const yearEgi = rentRoll.hasLeases
      ? yearLeaseRevenue + income.otherIncome * growthFactor
      : grossPotentialRent * growthFactor * (1 - income.vacancyPct / 100) +
        income.otherIncome * growthFactor;
    const yearOpex = totalOpex * Math.pow(1.02, y - 1);
    yearNoi.push(yearEgi - yearOpex);
  }

  return {
    equityRequired,
    initialLoanAmount,
    rate,
    annualDebtService,
    ioAnnualDebtService,
    loanFeePct: financing.loanFeePct,
    amortizationYears: financing.amortizationYears,
    ioPeriodYears: financing.ioPeriodYears,
    exitCapRatePct: exit.exitCapRate,
    dispositionCostsPct: exit.dispositionCostsPct,
    yearNoi,
  };
}

function computeRefinanceScenario(
  assumptions: FinancialModelAssumptions,
  refinanceYear: number,
  exitYear: number,
  context?: ProFormaContext
): {
  exitValue: number;
  equityProceeds: number;
  equityMultiple: number;
  irr: number | null;
} {
  const operating = buildOperatingScenarioInputs(assumptions, exitYear, context);
  const {
    equityRequired,
    initialLoanAmount,
    rate,
    annualDebtService,
    ioAnnualDebtService,
    loanFeePct,
    amortizationYears,
    ioPeriodYears,
    exitCapRatePct,
    dispositionCostsPct,
    yearNoi,
  } = operating;

  const refinanceNoi = yearNoi[refinanceYear - 1] ?? 0;
  const refinanceValue =
    exitCapRatePct > 0 ? refinanceNoi / (exitCapRatePct / 100) : 0;
  const refinanceLoanAmount =
    refinanceValue * (assumptions.financing.ltvPct / 100);
  const refinanceCosts = refinanceLoanAmount * (loanFeePct / 100);
  const oldLoanPayoff =
    initialLoanAmount > 0
      ? estimateRemainingBalance(
          initialLoanAmount,
          rate,
          amortizationYears,
          refinanceYear
        )
      : 0;
  const refinanceProceeds =
    refinanceLoanAmount - oldLoanPayoff - refinanceCosts;

  const refinancedAnnualDebtService = computeAnnualDebtService(
    refinanceLoanAmount,
    rate,
    amortizationYears
  );
  const refinancedIoDebtService = refinanceLoanAmount * rate;

  const leveredCFs: number[] = [-equityRequired];
  let totalDistributions = 0;
  let exitValue = 0;

  for (let year = 1; year <= exitYear; year++) {
    const noi = yearNoi[year - 1] ?? 0;
    const debtService =
      year <= refinanceYear
        ? year <= ioPeriodYears
          ? ioAnnualDebtService
          : annualDebtService
        : year - refinanceYear <= ioPeriodYears
          ? refinancedIoDebtService
          : refinancedAnnualDebtService;

    let yearCashflow = noi - debtService;
    if (year === refinanceYear) {
      yearCashflow += refinanceProceeds;
    }
    if (year === exitYear) {
      exitValue = exitCapRatePct > 0 ? noi / (exitCapRatePct / 100) : 0;
      const dispositionCosts = exitValue * (dispositionCostsPct / 100);
      const refinancedLoanPayoff =
        refinanceLoanAmount > 0
          ? estimateRemainingBalance(
              refinanceLoanAmount,
              rate,
              amortizationYears,
              Math.max(exitYear - refinanceYear, 0)
            )
          : 0;
      yearCashflow += exitValue - dispositionCosts - refinancedLoanPayoff;
    }

    totalDistributions += yearCashflow;
    leveredCFs.push(yearCashflow);
  }

  return {
    exitValue: round(exitValue, 0),
    equityProceeds: round(totalDistributions, 0),
    equityMultiple:
      equityRequired > 0 ? round(totalDistributions / equityRequired, 2) : 0,
    irr: computeIRR(leveredCFs),
  };
}

export function modelExitScenarios(
  assumptions: FinancialModelAssumptions,
  context?: ProFormaContext
): ExitScenarioAnalysis {
  const sellScenarios: ExitScenarioResult[] = [];
  for (let year = 1; year <= 10; year++) {
    const scenarioAssumptions: FinancialModelAssumptions = {
      ...assumptions,
      exit: { ...assumptions.exit, holdYears: year },
    };
    const result = computeProForma(scenarioAssumptions, context);
    const equityProceeds =
      result.netProfit + result.acquisitionBasis.equityRequired;
    sellScenarios.push({
      id: `sell_year_${year}`,
      label: `Sell Year ${year}`,
      path: "sell",
      timing: toRoundedTiming(year, null, year),
      exitValue: result.exitAnalysis.salePrice,
      equityProceeds: round(equityProceeds, 0),
      equityMultiple: result.equityMultiple,
      irr: result.leveredIRR,
      irrMaximizingExitTiming: toRoundedTiming(year, null, year),
    });
  }

  const refinanceScenarios: ExitScenarioResult[] = [];
  for (let refinanceYear = 1; refinanceYear <= 9; refinanceYear++) {
    for (let exitYear = refinanceYear + 1; exitYear <= 10; exitYear++) {
      const metrics = computeRefinanceScenario(
        assumptions,
        refinanceYear,
        exitYear,
        context
      );
      refinanceScenarios.push({
        id: `refi_y${refinanceYear}_exit_y${exitYear}`,
        label: `Refi Y${refinanceYear} -> Exit Y${exitYear}`,
        path: "refinance_hold",
        timing: toRoundedTiming(exitYear, refinanceYear, exitYear),
        exitValue: metrics.exitValue,
        equityProceeds: metrics.equityProceeds,
        equityMultiple: metrics.equityMultiple,
        irr: metrics.irr,
        irrMaximizingExitTiming: toRoundedTiming(
          exitYear,
          refinanceYear,
          exitYear
        ),
      });
    }
  }

  const stabilizationYear = Math.max(
    1,
    Math.min(10, Math.min(assumptions.exit.holdYears, assumptions.financing.ioPeriodYears + 2))
  );
  const stabilizationAssumptions: FinancialModelAssumptions = {
    ...assumptions,
    exit: { ...assumptions.exit, holdYears: stabilizationYear },
  };
  const stabilizationProForma = computeProForma(
    stabilizationAssumptions,
    context
  );
  const stabilizationEquityProceeds =
    stabilizationProForma.netProfit +
    stabilizationProForma.acquisitionBasis.equityRequired;
  const stabilizationScenario: ExitScenarioResult = {
    id: `stabilization_year_${stabilizationYear}`,
    label: `Disposition at Stabilization (Y${stabilizationYear})`,
    path: "stabilization_disposition",
    timing: toRoundedTiming(stabilizationYear, null, stabilizationYear),
    exitValue: stabilizationProForma.exitAnalysis.salePrice,
    equityProceeds: round(stabilizationEquityProceeds, 0),
    equityMultiple: stabilizationProForma.equityMultiple,
    irr: stabilizationProForma.leveredIRR,
    irrMaximizingExitTiming: toRoundedTiming(
      stabilizationYear,
      null,
      stabilizationYear
    ),
  };

  const bestSellScenario = sellScenarios.reduce<ExitScenarioResult | null>(
    (best, scenario) =>
      !best || scoreIrr(scenario.irr) > scoreIrr(best.irr) ? scenario : best,
    null
  );
  const bestRefinanceScenario = refinanceScenarios.reduce<ExitScenarioResult | null>(
    (best, scenario) =>
      !best || scoreIrr(scenario.irr) > scoreIrr(best.irr) ? scenario : best,
    null
  );

  const scenarios = [...sellScenarios, ...refinanceScenarios, stabilizationScenario];
  const rankedScenarios = [...scenarios].sort((a, b) => {
    const irrDelta = scoreIrr(b.irr) - scoreIrr(a.irr);
    if (irrDelta !== 0) {
      return irrDelta;
    }
    return b.equityMultiple - a.equityMultiple;
  });

  const sellMaxTiming =
    bestSellScenario?.timing ?? toRoundedTiming(assumptions.exit.holdYears, null, assumptions.exit.holdYears);
  const refinanceMaxTiming =
    bestRefinanceScenario?.timing ??
    toRoundedTiming(assumptions.exit.holdYears, 1, assumptions.exit.holdYears);

  for (const scenario of scenarios) {
    if (scenario.path === "sell") {
      scenario.irrMaximizingExitTiming = sellMaxTiming;
    } else if (scenario.path === "refinance_hold") {
      scenario.irrMaximizingExitTiming = refinanceMaxTiming;
    } else {
      scenario.irrMaximizingExitTiming = stabilizationScenario.timing;
    }
  }

  return {
    scenarios,
    rankedScenarios,
    sellStrategy: {
      bestTiming: bestSellScenario?.timing ?? null,
      bestIrr: bestSellScenario?.irr ?? null,
    },
    refinanceStrategy: {
      bestTiming: bestRefinanceScenario?.timing ?? null,
      bestIrr: bestRefinanceScenario?.irr ?? null,
    },
    stabilizationStrategy: {
      timing: stabilizationScenario.timing,
      irr: stabilizationScenario.irr,
    },
    overallBestScenarioId: rankedScenarios[0]?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook — memoized wrapper for React components
// ---------------------------------------------------------------------------

export function useProFormaCalculations(
  assumptions: FinancialModelAssumptions,
  context?: ProFormaContext
): ProFormaResults {
  return useMemo(() => computeProForma(assumptions, context), [assumptions, context]);
}
