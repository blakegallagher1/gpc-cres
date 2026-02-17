import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import {
  aggregateRentRoll,
  summarizeDevelopmentBudget,
  type DevelopmentBudgetCalcInput,
} from "@entitlement-os/shared";

const HIGH_IMPACT_STATUSES = ["APPROVED", "EXIT_MARKETED", "EXITED", "KILLED"] as const;
const PACK_STALE_DAYS = 7;
const PACK_COVERAGE_MINIMUM = 0.75;
const STRESS_SCENARIO_IDS = [
  "base",
  "upside",
  "downside",
  "rate_shock_200bps",
  "recession",
  "tenant_loss",
] as const;

type StressScenarioId = (typeof STRESS_SCENARIO_IDS)[number];

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function decimalToNumber(value: { toString(): string } | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value.toString());
}

function buildDevelopmentBudgetInput(
  budget: { lineItems: unknown; contingencies: unknown } | null,
): DevelopmentBudgetCalcInput {
  const lineItems: DevelopmentBudgetCalcInput["lineItems"] = [];
  if (budget && Array.isArray(budget.lineItems)) {
    for (const item of budget.lineItems) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const candidate = item as {
        name?: unknown;
        category?: unknown;
        amount?: unknown;
      };
      if (
        typeof candidate.name === "string" &&
        (candidate.category === "hard" ||
          candidate.category === "soft" ||
          candidate.category === "other") &&
        typeof candidate.amount === "number"
      ) {
        lineItems.push({
          name: candidate.name,
          category: candidate.category,
          amount: candidate.amount,
        });
      }
    }
  }

  const contingencies: DevelopmentBudgetCalcInput["contingencies"] = {};
  if (budget && budget.contingencies && typeof budget.contingencies === "object") {
    const candidate = budget.contingencies as {
      hardCostContingencyPct?: unknown;
      softCostContingencyPct?: unknown;
    };
    if (typeof candidate.hardCostContingencyPct === "number") {
      contingencies.hardCostContingencyPct = candidate.hardCostContingencyPct;
    }
    if (typeof candidate.softCostContingencyPct === "number") {
      contingencies.softCostContingencyPct = candidate.softCostContingencyPct;
    }
  }

  return { lineItems, contingencies };
}

type ToolFinancialAssumptions = {
  acquisition: {
    purchasePrice: number;
    closingCostsPct: number;
    earnestMoney: number;
  };
  income: {
    rentPerSf: number;
    vacancyPct: number;
    rentGrowthPct: number;
    otherIncome: number;
  };
  expenses: {
    opexPerSf: number;
    managementFeePct: number;
    capexReserves: number;
    insurance: number;
    taxes: number;
  };
  financing: {
    ltvPct: number;
    interestRate: number;
    amortizationYears: number;
    ioPeriodYears: number;
    loanFeePct: number;
  };
  exit: {
    holdYears: number;
    exitCapRate: number;
    dispositionCostsPct: number;
  };
  buildableSf: number;
};

type StoredStressScenario = {
  id: StressScenarioId;
  name: string;
  probabilityPct: number;
  assumptions: ToolFinancialAssumptions;
};

const DEFAULT_FINANCIAL_ASSUMPTIONS: ToolFinancialAssumptions = {
  acquisition: {
    purchasePrice: 1_000_000,
    closingCostsPct: 2,
    earnestMoney: 25_000,
  },
  income: {
    rentPerSf: 8,
    vacancyPct: 5,
    rentGrowthPct: 2,
    otherIncome: 0,
  },
  expenses: {
    opexPerSf: 2,
    managementFeePct: 5,
    capexReserves: 0.25,
    insurance: 0.5,
    taxes: 1,
  },
  financing: {
    ltvPct: 65,
    interestRate: 6.5,
    amortizationYears: 25,
    ioPeriodYears: 0,
    loanFeePct: 1,
  },
  exit: {
    holdYears: 5,
    exitCapRate: 7.5,
    dispositionCostsPct: 2,
  },
  buildableSf: 20_000,
};

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampMin(value: number, min: number): number {
  return Math.max(value, min);
}

function toToolAssumptions(raw: unknown): ToolFinancialAssumptions {
  if (!isRecord(raw)) {
    return structuredClone(DEFAULT_FINANCIAL_ASSUMPTIONS);
  }

  const acquisitionRaw = isRecord(raw.acquisition) ? raw.acquisition : {};
  const incomeRaw = isRecord(raw.income) ? raw.income : {};
  const expensesRaw = isRecord(raw.expenses) ? raw.expenses : {};
  const financingRaw = isRecord(raw.financing) ? raw.financing : {};
  const exitRaw = isRecord(raw.exit) ? raw.exit : {};

  return {
    acquisition: {
      purchasePrice: asFiniteNumber(
        acquisitionRaw.purchasePrice,
        DEFAULT_FINANCIAL_ASSUMPTIONS.acquisition.purchasePrice,
      ),
      closingCostsPct: asFiniteNumber(
        acquisitionRaw.closingCostsPct,
        DEFAULT_FINANCIAL_ASSUMPTIONS.acquisition.closingCostsPct,
      ),
      earnestMoney: asFiniteNumber(
        acquisitionRaw.earnestMoney,
        DEFAULT_FINANCIAL_ASSUMPTIONS.acquisition.earnestMoney,
      ),
    },
    income: {
      rentPerSf: asFiniteNumber(incomeRaw.rentPerSf, DEFAULT_FINANCIAL_ASSUMPTIONS.income.rentPerSf),
      vacancyPct: asFiniteNumber(incomeRaw.vacancyPct, DEFAULT_FINANCIAL_ASSUMPTIONS.income.vacancyPct),
      rentGrowthPct: asFiniteNumber(
        incomeRaw.rentGrowthPct,
        DEFAULT_FINANCIAL_ASSUMPTIONS.income.rentGrowthPct,
      ),
      otherIncome: asFiniteNumber(incomeRaw.otherIncome, DEFAULT_FINANCIAL_ASSUMPTIONS.income.otherIncome),
    },
    expenses: {
      opexPerSf: asFiniteNumber(expensesRaw.opexPerSf, DEFAULT_FINANCIAL_ASSUMPTIONS.expenses.opexPerSf),
      managementFeePct: asFiniteNumber(
        expensesRaw.managementFeePct,
        DEFAULT_FINANCIAL_ASSUMPTIONS.expenses.managementFeePct,
      ),
      capexReserves: asFiniteNumber(
        expensesRaw.capexReserves,
        DEFAULT_FINANCIAL_ASSUMPTIONS.expenses.capexReserves,
      ),
      insurance: asFiniteNumber(expensesRaw.insurance, DEFAULT_FINANCIAL_ASSUMPTIONS.expenses.insurance),
      taxes: asFiniteNumber(expensesRaw.taxes, DEFAULT_FINANCIAL_ASSUMPTIONS.expenses.taxes),
    },
    financing: {
      ltvPct: asFiniteNumber(financingRaw.ltvPct, DEFAULT_FINANCIAL_ASSUMPTIONS.financing.ltvPct),
      interestRate: asFiniteNumber(
        financingRaw.interestRate,
        DEFAULT_FINANCIAL_ASSUMPTIONS.financing.interestRate,
      ),
      amortizationYears: asFiniteNumber(
        financingRaw.amortizationYears,
        DEFAULT_FINANCIAL_ASSUMPTIONS.financing.amortizationYears,
      ),
      ioPeriodYears: asFiniteNumber(
        financingRaw.ioPeriodYears,
        DEFAULT_FINANCIAL_ASSUMPTIONS.financing.ioPeriodYears,
      ),
      loanFeePct: asFiniteNumber(financingRaw.loanFeePct, DEFAULT_FINANCIAL_ASSUMPTIONS.financing.loanFeePct),
    },
    exit: {
      holdYears: asFiniteNumber(exitRaw.holdYears, DEFAULT_FINANCIAL_ASSUMPTIONS.exit.holdYears),
      exitCapRate: asFiniteNumber(exitRaw.exitCapRate, DEFAULT_FINANCIAL_ASSUMPTIONS.exit.exitCapRate),
      dispositionCostsPct: asFiniteNumber(
        exitRaw.dispositionCostsPct,
        DEFAULT_FINANCIAL_ASSUMPTIONS.exit.dispositionCostsPct,
      ),
    },
    buildableSf: asFiniteNumber(raw.buildableSf, DEFAULT_FINANCIAL_ASSUMPTIONS.buildableSf),
  };
}

function withScenarioAdjustments(
  base: ToolFinancialAssumptions,
  scenarioId: StressScenarioId,
): ToolFinancialAssumptions {
  const scenario = structuredClone(base);

  if (scenarioId === "upside") {
    scenario.income.rentPerSf = round(base.income.rentPerSf * 1.08, 4);
    scenario.income.vacancyPct = round(clampMin(base.income.vacancyPct - 2, 0), 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct + 1, 4);
    scenario.expenses.opexPerSf = round(clampMin(base.expenses.opexPerSf * 0.97, 0), 4);
    scenario.exit.exitCapRate = round(clampMin(base.exit.exitCapRate - 0.5, 0.1), 4);
    return scenario;
  }

  if (scenarioId === "downside") {
    scenario.income.rentPerSf = round(clampMin(base.income.rentPerSf * 0.93, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 3, 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct - 1, 4);
    scenario.expenses.opexPerSf = round(base.expenses.opexPerSf * 1.05, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 0.5, 4);
    return scenario;
  }

  if (scenarioId === "rate_shock_200bps") {
    scenario.financing.interestRate = round(base.financing.interestRate + 2, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 0.25, 4);
    return scenario;
  }

  if (scenarioId === "recession") {
    scenario.income.rentPerSf = round(clampMin(base.income.rentPerSf * 0.85, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 7, 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct - 2, 4);
    scenario.expenses.opexPerSf = round(base.expenses.opexPerSf * 1.08, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 1, 4);
    return scenario;
  }

  if (scenarioId === "tenant_loss") {
    scenario.income.rentPerSf = round(clampMin(base.income.rentPerSf * 0.9, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 15, 4);
    scenario.income.otherIncome = round(clampMin(base.income.otherIncome * 0.85, 0), 4);
    return scenario;
  }

  return scenario;
}

function getDefaultScenarioDefinitions(base: ToolFinancialAssumptions): StoredStressScenario[] {
  return [
    { id: "base", name: "Base", probabilityPct: 35, assumptions: withScenarioAdjustments(base, "base") },
    {
      id: "upside",
      name: "Upside",
      probabilityPct: 15,
      assumptions: withScenarioAdjustments(base, "upside"),
    },
    {
      id: "downside",
      name: "Downside",
      probabilityPct: 20,
      assumptions: withScenarioAdjustments(base, "downside"),
    },
    {
      id: "rate_shock_200bps",
      name: "Rate Shock +200bps",
      probabilityPct: 10,
      assumptions: withScenarioAdjustments(base, "rate_shock_200bps"),
    },
    {
      id: "recession",
      name: "Recession",
      probabilityPct: 10,
      assumptions: withScenarioAdjustments(base, "recession"),
    },
    {
      id: "tenant_loss",
      name: "Tenant Loss",
      probabilityPct: 10,
      assumptions: withScenarioAdjustments(base, "tenant_loss"),
    },
  ];
}

function resolveScenarioBundle(assumptionsRaw: unknown): StoredStressScenario[] {
  const base = toToolAssumptions(assumptionsRaw);
  if (!isRecord(assumptionsRaw) || !isRecord(assumptionsRaw.stressScenarioBundle)) {
    return getDefaultScenarioDefinitions(base);
  }

  const bundleScenarios = assumptionsRaw.stressScenarioBundle.scenarios;
  if (!Array.isArray(bundleScenarios)) {
    return getDefaultScenarioDefinitions(base);
  }

  const defaultScenarios = getDefaultScenarioDefinitions(base);
  const defaultsById = new Map<StressScenarioId, StoredStressScenario>(
    defaultScenarios.map((scenario) => [scenario.id, scenario]),
  );

  const resolved: StoredStressScenario[] = [];
  for (const entry of bundleScenarios) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      continue;
    }
    if (!STRESS_SCENARIO_IDS.includes(entry.id as StressScenarioId)) {
      continue;
    }
    const scenarioId = entry.id as StressScenarioId;
    const defaults = defaultsById.get(scenarioId);
    if (!defaults) {
      continue;
    }
    resolved.push({
      id: scenarioId,
      name: typeof entry.name === "string" ? entry.name : defaults.name,
      probabilityPct: asFiniteNumber(entry.probabilityPct, defaults.probabilityPct),
      assumptions: toToolAssumptions(entry.assumptions),
    });
  }

  if (resolved.length === 0) {
    return defaultScenarios;
  }

  const foundIds = new Set(resolved.map((scenario) => scenario.id));
  for (const defaults of defaultScenarios) {
    if (!foundIds.has(defaults.id)) {
      resolved.push(defaults);
    }
  }
  return resolved;
}

type StressScenarioMetrics = {
  leveredIRR: number | null;
  equityMultiple: number;
};

type ExitScenarioTiming = {
  sellYear: number;
  refinanceYear: number | null;
  exitYear: number;
};

type ExitScenarioPath = "sell" | "refinance_hold" | "stabilization_disposition";

type ExitScenarioRow = {
  id: string;
  label: string;
  path: ExitScenarioPath;
  timing: ExitScenarioTiming;
  exitValue: number;
  equityProceeds: number;
  equityMultiple: number;
  irrPct: number | null;
  irrMaximizingExitTiming: ExitScenarioTiming;
};

function estimateRemainingBalance(
  principal: number,
  annualRate: number,
  amortYears: number,
  yearsElapsed: number,
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
    (monthlyPayment * (Math.pow(1 + monthlyRate, paymentsMade) - 1)) / monthlyRate;
  return Math.max(balance, 0);
}

function computeAnnualDebtService(
  principal: number,
  annualRate: number,
  amortizationYears: number,
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

function computeIrr(
  cashflows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 0.0001,
): number | null {
  if (cashflows.length === 0) {
    return null;
  }
  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  let rate = guess;
  for (let i = 0; i < maxIterations; i += 1) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t += 1) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < tolerance) {
      return rate;
    }
    if (dnpv === 0) {
      break;
    }
    rate -= npv / dnpv;
  }
  return rate;
}

function computeStressScenarioMetrics(assumptions: ToolFinancialAssumptions): StressScenarioMetrics {
  const closingCosts = assumptions.acquisition.purchasePrice * (assumptions.acquisition.closingCostsPct / 100);
  const basisBeforeDebt = assumptions.acquisition.purchasePrice + closingCosts;
  const loanAmount = basisBeforeDebt * (assumptions.financing.ltvPct / 100);
  const loanFees = loanAmount * (assumptions.financing.loanFeePct / 100);
  const totalBasis = basisBeforeDebt + loanFees;
  const equityRequired = totalBasis - loanAmount;

  const grossPotentialRent = assumptions.buildableSf * assumptions.income.rentPerSf;
  const effectiveGrossIncome =
    grossPotentialRent * (1 - assumptions.income.vacancyPct / 100) + assumptions.income.otherIncome;
  const totalOpex =
    assumptions.buildableSf * assumptions.expenses.opexPerSf +
    effectiveGrossIncome * (assumptions.expenses.managementFeePct / 100) +
    assumptions.buildableSf * assumptions.expenses.capexReserves +
    assumptions.buildableSf * assumptions.expenses.insurance +
    assumptions.buildableSf * assumptions.expenses.taxes;

  const rate = assumptions.financing.interestRate / 100;
  let annualDebtService = 0;
  if (loanAmount > 0 && rate > 0 && assumptions.financing.amortizationYears > 0) {
    const monthlyRate = rate / 12;
    const numPayments = assumptions.financing.amortizationYears * 12;
    const monthlyPayment =
      loanAmount *
      ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1));
    annualDebtService = monthlyPayment * 12;
  }
  const ioAnnualDebtService = loanAmount * rate;

  const holdYears = Math.max(1, Math.min(30, Math.floor(assumptions.exit.holdYears)));
  const leveredCFs: number[] = [-equityRequired];
  let cumulativeCF = 0;

  for (let year = 1; year <= holdYears; year += 1) {
    const growthFactor = Math.pow(1 + assumptions.income.rentGrowthPct / 100, year - 1);
    const yearEgi =
      grossPotentialRent * growthFactor * (1 - assumptions.income.vacancyPct / 100) +
      assumptions.income.otherIncome * growthFactor;
    const yearOpex = totalOpex * Math.pow(1.02, year - 1);
    const yearNoi = yearEgi - yearOpex;
    const yearDebtService = year <= assumptions.financing.ioPeriodYears ? ioAnnualDebtService : annualDebtService;
    const leveredCF = yearNoi - yearDebtService;
    cumulativeCF += leveredCF;
    leveredCFs.push(leveredCF);
  }

  const exitGrowth = Math.pow(1 + assumptions.income.rentGrowthPct / 100, holdYears);
  const exitNoi =
    grossPotentialRent * exitGrowth * (1 - assumptions.income.vacancyPct / 100) +
    assumptions.income.otherIncome * exitGrowth -
    totalOpex * Math.pow(1.02, holdYears);

  const salePrice = assumptions.exit.exitCapRate > 0 ? exitNoi / (assumptions.exit.exitCapRate / 100) : 0;
  const dispositionCosts = salePrice * (assumptions.exit.dispositionCostsPct / 100);
  const loanPayoff =
    loanAmount > 0
      ? estimateRemainingBalance(
          loanAmount,
          rate,
          assumptions.financing.amortizationYears,
          holdYears,
        )
      : 0;
  const netProceeds = salePrice - dispositionCosts - loanPayoff;
  leveredCFs[holdYears] += netProceeds;

  const leveredIRR = computeIrr(leveredCFs);
  const totalLeveredReturn = cumulativeCF + netProceeds;
  const equityMultiple = equityRequired > 0 ? totalLeveredReturn / equityRequired : 0;

  return {
    leveredIRR,
    equityMultiple: round(equityMultiple, 4),
  };
}

function irrScore(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

function withHoldYear(
  assumptions: ToolFinancialAssumptions,
  holdYears: number,
): ToolFinancialAssumptions {
  return {
    ...assumptions,
    exit: {
      ...assumptions.exit,
      holdYears,
    },
  };
}

function toTiming(sellYear: number, refinanceYear: number | null, exitYear: number): ExitScenarioTiming {
  return {
    sellYear: Math.round(sellYear),
    refinanceYear: refinanceYear === null ? null : Math.round(refinanceYear),
    exitYear: Math.round(exitYear),
  };
}

function computeExitScenarioAtHoldYear(
  assumptions: ToolFinancialAssumptions,
): {
  exitValue: number;
  equityProceeds: number;
  equityMultiple: number;
  irrPct: number | null;
} {
  const closingCosts = assumptions.acquisition.purchasePrice * (assumptions.acquisition.closingCostsPct / 100);
  const basisBeforeDebt = assumptions.acquisition.purchasePrice + closingCosts;
  const loanAmount = basisBeforeDebt * (assumptions.financing.ltvPct / 100);
  const loanFees = loanAmount * (assumptions.financing.loanFeePct / 100);
  const totalBasis = basisBeforeDebt + loanFees;
  const equityRequired = totalBasis - loanAmount;

  const grossPotentialRent = assumptions.buildableSf * assumptions.income.rentPerSf;
  const effectiveGrossIncome =
    grossPotentialRent * (1 - assumptions.income.vacancyPct / 100) + assumptions.income.otherIncome;
  const totalOpex =
    assumptions.buildableSf * assumptions.expenses.opexPerSf +
    effectiveGrossIncome * (assumptions.expenses.managementFeePct / 100) +
    assumptions.buildableSf * assumptions.expenses.capexReserves +
    assumptions.buildableSf * assumptions.expenses.insurance +
    assumptions.buildableSf * assumptions.expenses.taxes;

  const rate = assumptions.financing.interestRate / 100;
  const annualDebtService = computeAnnualDebtService(
    loanAmount,
    rate,
    assumptions.financing.amortizationYears,
  );
  const ioAnnualDebtService = loanAmount * rate;

  const holdYears = Math.max(1, Math.min(30, Math.floor(assumptions.exit.holdYears)));
  const leveredCFs: number[] = [-equityRequired];
  let cumulativeCF = 0;
  let terminalNoi = 0;

  for (let year = 1; year <= holdYears; year += 1) {
    const growthFactor = Math.pow(1 + assumptions.income.rentGrowthPct / 100, year - 1);
    const yearEgi =
      grossPotentialRent * growthFactor * (1 - assumptions.income.vacancyPct / 100) +
      assumptions.income.otherIncome * growthFactor;
    const yearOpex = totalOpex * Math.pow(1.02, year - 1);
    const yearNoi = yearEgi - yearOpex;
    terminalNoi = yearNoi;
    const yearDebtService =
      year <= assumptions.financing.ioPeriodYears ? ioAnnualDebtService : annualDebtService;
    const yearCashflow = yearNoi - yearDebtService;
    cumulativeCF += yearCashflow;
    leveredCFs.push(yearCashflow);
  }

  const exitValue =
    assumptions.exit.exitCapRate > 0 ? terminalNoi / (assumptions.exit.exitCapRate / 100) : 0;
  const dispositionCosts = exitValue * (assumptions.exit.dispositionCostsPct / 100);
  const loanPayoff =
    loanAmount > 0
      ? estimateRemainingBalance(
          loanAmount,
          rate,
          assumptions.financing.amortizationYears,
          holdYears,
        )
      : 0;
  const netProceeds = exitValue - dispositionCosts - loanPayoff;
  leveredCFs[holdYears] += netProceeds;

  const irr = computeIrr(leveredCFs);
  const equityProceeds = cumulativeCF + netProceeds;
  const equityMultiple = equityRequired > 0 ? equityProceeds / equityRequired : 0;

  return {
    exitValue: round(exitValue, 0),
    equityProceeds: round(equityProceeds, 0),
    equityMultiple: round(equityMultiple, 2),
    irrPct: irr === null ? null : round(irr * 100, 2),
  };
}

function computeRefinanceExitScenario(
  assumptions: ToolFinancialAssumptions,
  refinanceYear: number,
  exitYear: number,
): {
  exitValue: number;
  equityProceeds: number;
  equityMultiple: number;
  irrPct: number | null;
} {
  const closingCosts = assumptions.acquisition.purchasePrice * (assumptions.acquisition.closingCostsPct / 100);
  const basisBeforeDebt = assumptions.acquisition.purchasePrice + closingCosts;
  const initialLoanAmount = basisBeforeDebt * (assumptions.financing.ltvPct / 100);
  const loanFees = initialLoanAmount * (assumptions.financing.loanFeePct / 100);
  const totalBasis = basisBeforeDebt + loanFees;
  const equityRequired = totalBasis - initialLoanAmount;

  const grossPotentialRent = assumptions.buildableSf * assumptions.income.rentPerSf;
  const effectiveGrossIncome =
    grossPotentialRent * (1 - assumptions.income.vacancyPct / 100) + assumptions.income.otherIncome;
  const totalOpex =
    assumptions.buildableSf * assumptions.expenses.opexPerSf +
    effectiveGrossIncome * (assumptions.expenses.managementFeePct / 100) +
    assumptions.buildableSf * assumptions.expenses.capexReserves +
    assumptions.buildableSf * assumptions.expenses.insurance +
    assumptions.buildableSf * assumptions.expenses.taxes;

  const rate = assumptions.financing.interestRate / 100;
  const annualDebtService = computeAnnualDebtService(
    initialLoanAmount,
    rate,
    assumptions.financing.amortizationYears,
  );
  const ioAnnualDebtService = initialLoanAmount * rate;

  const yearNoi: number[] = [];
  for (let year = 1; year <= exitYear; year += 1) {
    const growthFactor = Math.pow(1 + assumptions.income.rentGrowthPct / 100, year - 1);
    const yearEgi =
      grossPotentialRent * growthFactor * (1 - assumptions.income.vacancyPct / 100) +
      assumptions.income.otherIncome * growthFactor;
    const yearOpex = totalOpex * Math.pow(1.02, year - 1);
    yearNoi.push(yearEgi - yearOpex);
  }

  const refinanceNoi = yearNoi[refinanceYear - 1] ?? 0;
  const refinanceValue =
    assumptions.exit.exitCapRate > 0 ? refinanceNoi / (assumptions.exit.exitCapRate / 100) : 0;
  const refinanceLoanAmount =
    refinanceValue * (assumptions.financing.ltvPct / 100);
  const refinanceCosts = refinanceLoanAmount * (assumptions.financing.loanFeePct / 100);
  const oldLoanPayoff =
    initialLoanAmount > 0
      ? estimateRemainingBalance(
          initialLoanAmount,
          rate,
          assumptions.financing.amortizationYears,
          refinanceYear,
        )
      : 0;
  const refinanceProceeds = refinanceLoanAmount - oldLoanPayoff - refinanceCosts;

  const refinancedAnnualDebtService = computeAnnualDebtService(
    refinanceLoanAmount,
    rate,
    assumptions.financing.amortizationYears,
  );
  const refinancedIoDebtService = refinanceLoanAmount * rate;

  const leveredCFs: number[] = [-equityRequired];
  let equityProceeds = 0;
  let exitValue = 0;
  for (let year = 1; year <= exitYear; year += 1) {
    const debtService =
      year <= refinanceYear
        ? year <= assumptions.financing.ioPeriodYears
          ? ioAnnualDebtService
          : annualDebtService
        : year - refinanceYear <= assumptions.financing.ioPeriodYears
          ? refinancedIoDebtService
          : refinancedAnnualDebtService;
    let yearCashflow = (yearNoi[year - 1] ?? 0) - debtService;

    if (year === refinanceYear) {
      yearCashflow += refinanceProceeds;
    }

    if (year === exitYear) {
      exitValue =
        assumptions.exit.exitCapRate > 0
          ? (yearNoi[year - 1] ?? 0) / (assumptions.exit.exitCapRate / 100)
          : 0;
      const dispositionCosts = exitValue * (assumptions.exit.dispositionCostsPct / 100);
      const refinancedLoanPayoff =
        refinanceLoanAmount > 0
          ? estimateRemainingBalance(
              refinanceLoanAmount,
              rate,
              assumptions.financing.amortizationYears,
              Math.max(exitYear - refinanceYear, 0),
            )
          : 0;
      yearCashflow += exitValue - dispositionCosts - refinancedLoanPayoff;
    }

    equityProceeds += yearCashflow;
    leveredCFs.push(yearCashflow);
  }

  const irr = computeIrr(leveredCFs);
  const equityMultiple = equityRequired > 0 ? equityProceeds / equityRequired : 0;
  return {
    exitValue: round(exitValue, 0),
    equityProceeds: round(equityProceeds, 0),
    equityMultiple: round(equityMultiple, 2),
    irrPct: irr === null ? null : round(irr * 100, 2),
  };
}

export const getDealContext = tool({
  name: "get_deal_context",
  description:
    "Get full context for a deal including parcels, tasks, latest triage, and artifacts",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
  }),
  execute: async ({ orgId, dealId }) => {
    const dealSkuParam = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { sku: true },
    });
    if (!dealSkuParam) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const deal = await prisma.deal.findFirstOrThrow({
      where: { id: dealId, orgId },
      include: {
        parcels: true,
        tasks: { orderBy: { pipelineStep: "asc" } },
        artifacts: { orderBy: { version: "desc" } },
        jurisdiction: {
          include: {
            parishPackVersions: {
              where: { status: "current", sku: dealSkuParam.sku },
              orderBy: { generatedAt: "desc" },
              take: 1,
              select: {
                id: true,
                version: true,
                status: true,
                generatedAt: true,
                sourceEvidenceIds: true,
                sourceSnapshotIds: true,
                sourceContentHashes: true,
                sourceUrls: true,
                officialOnly: true,
                packCoverageScore: true,
                canonicalSchemaVersion: true,
                coverageSourceCount: true,
                inputHash: true,
              },
            },
          },
        },
      },
    });

    const latestPack = deal.jurisdiction?.parishPackVersions?.[0];
    const stalenessDays = latestPack?.generatedAt
      ? daysSince(latestPack.generatedAt)
      : null;
    const isStale = stalenessDays !== null && stalenessDays >= PACK_STALE_DAYS;
    const missingEvidence: string[] = [];
    if (!latestPack) {
      missingEvidence.push("No current parish pack found for this jurisdiction/SKU.");
    }
    if (isStale) {
      missingEvidence.push("Jurisdiction pack is stale.");
    }
    if (latestPack && !isJsonStringArray(latestPack.sourceEvidenceIds)) {
      missingEvidence.push("Pack missing sourceEvidenceIds lineage.");
    }
    if (
      latestPack &&
      latestPack.packCoverageScore !== null &&
      latestPack.packCoverageScore < PACK_COVERAGE_MINIMUM
    ) {
      missingEvidence.push(
        `Pack coverage score is ${latestPack.packCoverageScore.toFixed(2)} and below target threshold.`,
      );
    }

    const result = {
      ...deal,
      packContext: {
        hasPack: !!latestPack,
        isStale,
        stalenessDays,
        latestPack: latestPack
          ? {
              id: latestPack.id,
              version: latestPack.version,
              status: latestPack.status,
              generatedAt: latestPack.generatedAt.toISOString(),
              sourceEvidenceIds: latestPack.sourceEvidenceIds,
              sourceSnapshotIds: latestPack.sourceSnapshotIds,
              sourceContentHashes: latestPack.sourceContentHashes,
              sourceUrls: latestPack.sourceUrls,
              officialOnly: latestPack.officialOnly,
              packCoverageScore: latestPack.packCoverageScore,
              canonicalSchemaVersion: latestPack.canonicalSchemaVersion,
              coverageSourceCount: latestPack.coverageSourceCount,
              inputHash: latestPack.inputHash,
            }
          : null,
        missingEvidence,
      },
    };

    return JSON.stringify(result);
  },
});

export const createDeal = tool({
  name: "create_deal",
  description: "Create a new deal with a name, SKU type, and jurisdiction",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    createdBy: z.string().uuid().describe("The user ID creating the deal"),
    name: z.string().min(1).describe("Name of the deal"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("The SKU type for this deal"),
    jurisdictionId: z
      .string()
      .uuid()
      .describe("The jurisdiction this deal falls under"),
    notes: z.string().nullable().describe("Optional notes for the deal"),
    targetCloseDate: z
      .string()
      .nullable()
      .describe("Optional target close date (ISO 8601)"),
  }),
  execute: async ({
    orgId,
    createdBy,
    name,
    sku,
    jurisdictionId,
    notes,
    targetCloseDate,
  }) => {
    const deal = await prisma.deal.create({
      data: {
        orgId,
        createdBy,
        name,
        sku,
        jurisdictionId,
        notes: notes ?? null,
        targetCloseDate: targetCloseDate
          ? new Date(targetCloseDate)
          : null,
      },
    });
    return JSON.stringify(deal);
  },
});

export const updateDealStatus = tool({
  name: "update_deal_status",
  description: "Update the status of a deal (e.g. INTAKE -> TRIAGE_DONE)",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID to update"),
    status: z
      .enum([
        "INTAKE",
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
        "HEARING",
        "APPROVED",
        "EXIT_MARKETED",
        "EXITED",
        "KILLED",
      ])
      .describe("The new deal status"),
    notes: z.string().nullable().describe("Optional notes about the status change"),
    confirmed: z
      .boolean()
      .nullable()
      .describe("Required true for high-impact status transitions"),
  }),
  needsApproval: true,
  execute: async ({ orgId, dealId, status, notes, confirmed }) => {
    const highImpact = HIGH_IMPACT_STATUSES.includes(
      status as (typeof HIGH_IMPACT_STATUSES)[number],
    );
    if (highImpact && !confirmed) {
      return JSON.stringify({
        error:
          `High-impact transition to ${status} requires confirmed: true.\n` +
          "Set confirmed=true to allow this status update.",
      });
    }

    const deal = await prisma.deal.updateMany({
      where: { id: dealId, orgId },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    if (deal.count === 0) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }
    const updated = await prisma.deal.findFirstOrThrow({
      where: { id: dealId, orgId },
    });
    return JSON.stringify(updated);
  },
});

export const listDeals = tool({
  name: "list_deals",
  description: "List deals with optional filters by status and/or SKU type",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    status: z
      .enum([
        "INTAKE",
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
        "HEARING",
        "APPROVED",
        "EXIT_MARKETED",
        "EXITED",
        "KILLED",
      ])
      .nullable()
      .describe("Filter by deal status"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .nullable()
      .describe("Filter by SKU type"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Maximum number of deals to return (default 20)"),
  }),
  execute: async ({ orgId, status, sku, limit }) => {
    const deals = await prisma.deal.findMany({
      where: {
        orgId,
        ...(status ? { status } : {}),
        ...(sku ? { sku } : {}),
      },
      include: {
        jurisdiction: { select: { name: true, state: true } },
        _count: { select: { parcels: true, tasks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit ?? 20,
    });
    return JSON.stringify(deals);
  },
});

export const get_rent_roll = tool({
  name: "get_rent_roll",
  description:
    "Return full rent roll detail for a deal, including lease schedule, rollover vacancy behavior, and weighted average lease term.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
    holdYears: z
      .number()
      .int()
      .min(1)
      .max(30)
      .nullable()
      .describe("Optional hold period override for the lease schedule"),
  }),
  execute: async ({ orgId, dealId, holdYears }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true, financialModelAssumptions: true },
    });

    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const leases = await prisma.tenantLease.findMany({
      where: { orgId, dealId },
      include: {
        tenant: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    });

    const assumptions = deal.financialModelAssumptions as
      | {
          income?: { rentPerSf?: number; vacancyPct?: number };
          exit?: { holdYears?: number };
        }
      | null;

    const resolvedHoldYears = holdYears ?? assumptions?.exit?.holdYears ?? 10;
    const marketRentPerSf = assumptions?.income?.rentPerSf ?? 0;
    const marketVacancyPct = assumptions?.income?.vacancyPct ?? 5;

    const schedule = aggregateRentRoll({
      leases: leases.map((lease) => ({
        id: lease.id,
        tenantId: lease.tenantId,
        leaseName: lease.leaseName,
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentedAreaSf: decimalToNumber(lease.rentedAreaSf),
        rentPerSf: decimalToNumber(lease.rentPerSf),
        annualEscalationPct: decimalToNumber(lease.annualEscalationPct),
      })),
      holdYears: resolvedHoldYears,
      marketRentPerSf,
      marketVacancyPct,
    });

    return JSON.stringify({
      dealId,
      holdYears: resolvedHoldYears,
      leaseCount: leases.length,
      weightedAverageLeaseTermYears: schedule.weightedAverageLeaseTermYears,
      annualSchedule: schedule.annualSchedule,
      leases: leases.map((lease) => ({
        id: lease.id,
        tenantId: lease.tenantId,
        tenantName: lease.tenant.name,
        leaseName: lease.leaseName,
        startDate: lease.startDate.toISOString(),
        endDate: lease.endDate.toISOString(),
        rentedAreaSf: decimalToNumber(lease.rentedAreaSf),
        rentPerSf: decimalToNumber(lease.rentPerSf),
        annualEscalationPct: decimalToNumber(lease.annualEscalationPct),
      })),
    });
  },
});

export const model_capital_stack = tool({
  name: "model_capital_stack",
  description:
    "Model sources and uses from persisted capital sources + equity waterfall tiers for a deal.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
  }),
  execute: async ({ orgId, dealId }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true, financialModelAssumptions: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const budget = await prisma.developmentBudget.findFirst({
      where: { orgId, dealId },
      select: {
        lineItems: true,
        contingencies: true,
      },
    });
    const capitalSources = await prisma.capitalSource.findMany({
      where: { orgId, dealId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const equityWaterfalls = await prisma.equityWaterfall.findMany({
      where: { orgId, dealId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const assumptions = deal.financialModelAssumptions as
      | {
          acquisition?: { purchasePrice?: number; closingCostsPct?: number };
        }
      | null;
    const purchasePrice = assumptions?.acquisition?.purchasePrice ?? 0;
    const closingCostsPct = assumptions?.acquisition?.closingCostsPct ?? 0;
    const closingCosts = purchasePrice * (closingCostsPct / 100);
    const developmentBudgetSummary = summarizeDevelopmentBudget(
      buildDevelopmentBudgetInput(budget),
    );
    const totalUses = purchasePrice + closingCosts + developmentBudgetSummary.totalBudget;

    const totals = capitalSources.reduce(
      (acc, source) => {
        const amount = decimalToNumber(source.amount);
        acc.totalSources += amount;
        if (source.sourceKind === "DEBT" || source.sourceKind === "MEZZ") {
          acc.debtSources += amount;
        } else if (
          source.sourceKind === "LP_EQUITY" ||
          source.sourceKind === "GP_EQUITY" ||
          source.sourceKind === "PREF_EQUITY"
        ) {
          acc.equitySources += amount;
          if (source.sourceKind === "GP_EQUITY") {
            acc.gpEquity += amount;
          }
          if (source.sourceKind === "LP_EQUITY" || source.sourceKind === "PREF_EQUITY") {
            acc.lpEquity += amount;
          }
        } else {
          acc.otherSources += amount;
        }
        return acc;
      },
      {
        totalSources: 0,
        debtSources: 0,
        equitySources: 0,
        otherSources: 0,
        lpEquity: 0,
        gpEquity: 0,
      },
    );

    return JSON.stringify({
      dealId,
      sources: capitalSources.map((source) => ({
        id: source.id,
        name: source.name,
        sourceKind: source.sourceKind,
        amount: decimalToNumber(source.amount),
        notes: source.notes,
        sortOrder: source.sortOrder,
      })),
      waterfallTiers: equityWaterfalls.map((tier) => ({
        id: tier.id,
        tierName: tier.tierName,
        hurdleIrrPct: decimalToNumber(tier.hurdleIrrPct),
        lpDistributionPct: decimalToNumber(tier.lpDistributionPct),
        gpDistributionPct: decimalToNumber(tier.gpDistributionPct),
        sortOrder: tier.sortOrder,
      })),
      summary: {
        purchasePrice,
        closingCosts,
        developmentBudget: developmentBudgetSummary.totalBudget,
        totalUses,
        totalSources: totals.totalSources,
        debtSources: totals.debtSources,
        equitySources: totals.equitySources,
        otherSources: totals.otherSources,
        lpEquity: totals.lpEquity,
        gpEquity: totals.gpEquity,
        sourcesUsesDelta: totals.totalSources - totalUses,
      },
    });
  },
});

export const stress_test_deal = tool({
  name: "stress_test_deal",
  description:
    "Run predefined stress scenarios for a deal and return a scenario comparison table with probability-weighted expected IRR and equity multiple.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
    includeScenarioIds: z
      .array(z.enum(STRESS_SCENARIO_IDS))
      .nullable()
      .describe(
        "Optional list of scenario IDs to include. Null uses all predefined scenarios.",
      ),
  }),
  execute: async ({ orgId, dealId, includeScenarioIds }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true, financialModelAssumptions: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const allScenarios = resolveScenarioBundle(deal.financialModelAssumptions);
    const includeSet = includeScenarioIds ? new Set(includeScenarioIds) : null;
    const selectedScenarios = includeSet
      ? allScenarios.filter((scenario) => includeSet.has(scenario.id))
      : allScenarios;

    if (selectedScenarios.length === 0) {
      return JSON.stringify({
        error: "No scenarios selected for stress test",
      });
    }

    const baseScenario =
      allScenarios.find((scenario) => scenario.id === "base") ?? allScenarios[0];
    const baseMetrics = computeStressScenarioMetrics(baseScenario.assumptions);

    const rows = selectedScenarios.map((scenario) => {
      const metrics = computeStressScenarioMetrics(scenario.assumptions);
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        probabilityPct: round(scenario.probabilityPct, 2),
        leveredIrrPct: metrics.leveredIRR !== null ? round(metrics.leveredIRR * 100, 2) : null,
        equityMultiple: round(metrics.equityMultiple, 2),
        deltaVsBaseLeveredIrrPct:
          metrics.leveredIRR !== null && baseMetrics.leveredIRR !== null
            ? round((metrics.leveredIRR - baseMetrics.leveredIRR) * 100, 2)
            : null,
        deltaVsBaseEquityMultiple: round(
          metrics.equityMultiple - baseMetrics.equityMultiple,
          2,
        ),
      };
    });

    let totalWeight = 0;
    let weightedEquityMultiple = 0;
    let irrWeight = 0;
    let weightedIrr = 0;
    for (const scenario of selectedScenarios) {
      const weight = scenario.probabilityPct;
      if (weight <= 0 || !Number.isFinite(weight)) {
        continue;
      }
      const metrics = computeStressScenarioMetrics(scenario.assumptions);
      totalWeight += weight;
      weightedEquityMultiple += metrics.equityMultiple * weight;
      if (metrics.leveredIRR !== null) {
        irrWeight += weight;
        weightedIrr += metrics.leveredIRR * weight;
      }
    }

    return JSON.stringify({
      dealId,
      scenarios: rows,
      expected: {
        weightedLeveredIrrPct: irrWeight > 0 ? round((weightedIrr / irrWeight) * 100, 2) : null,
        weightedEquityMultiple:
          totalWeight > 0 ? round(weightedEquityMultiple / totalWeight, 2) : null,
      },
    });
  },
});

export const model_exit_scenarios = tool({
  name: "model_exit_scenarios",
  description:
    "Model exit strategies for sell-year timing, refinance-then-hold paths, and disposition at stabilization. Returns scenario-level exit value, equity proceeds, equity multiple, IRR, and IRR-maximizing timing.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID"),
    maxExitYear: z
      .number()
      .int()
      .min(3)
      .max(10)
      .nullable()
      .describe("Optional max exit year horizon (default 10)."),
  }),
  execute: async ({ orgId, dealId, maxExitYear }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true, financialModelAssumptions: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const assumptions = toToolAssumptions(deal.financialModelAssumptions);
    const horizon = maxExitYear ?? 10;

    const sellScenarios: ExitScenarioRow[] = [];
    for (let sellYear = 1; sellYear <= horizon; sellYear += 1) {
      const metrics = computeExitScenarioAtHoldYear(withHoldYear(assumptions, sellYear));
      sellScenarios.push({
        id: `sell_year_${sellYear}`,
        label: `Sell Year ${sellYear}`,
        path: "sell",
        timing: toTiming(sellYear, null, sellYear),
        exitValue: metrics.exitValue,
        equityProceeds: metrics.equityProceeds,
        equityMultiple: metrics.equityMultiple,
        irrPct: metrics.irrPct,
        irrMaximizingExitTiming: toTiming(sellYear, null, sellYear),
      });
    }

    const refinanceScenarios: ExitScenarioRow[] = [];
    for (let refinanceYear = 1; refinanceYear < horizon; refinanceYear += 1) {
      for (let exitYear = refinanceYear + 1; exitYear <= horizon; exitYear += 1) {
        const metrics = computeRefinanceExitScenario(
          assumptions,
          refinanceYear,
          exitYear,
        );
        refinanceScenarios.push({
          id: `refi_y${refinanceYear}_exit_y${exitYear}`,
          label: `Refi Y${refinanceYear} -> Exit Y${exitYear}`,
          path: "refinance_hold",
          timing: toTiming(exitYear, refinanceYear, exitYear),
          exitValue: metrics.exitValue,
          equityProceeds: metrics.equityProceeds,
          equityMultiple: metrics.equityMultiple,
          irrPct: metrics.irrPct,
          irrMaximizingExitTiming: toTiming(exitYear, refinanceYear, exitYear),
        });
      }
    }

    const stabilizationYear = Math.max(
      1,
      Math.min(horizon, Math.min(assumptions.exit.holdYears, assumptions.financing.ioPeriodYears + 2)),
    );
    const stabilizationMetrics = computeExitScenarioAtHoldYear(
      withHoldYear(assumptions, stabilizationYear),
    );
    const stabilizationScenario: ExitScenarioRow = {
      id: `stabilization_year_${stabilizationYear}`,
      label: `Disposition at Stabilization (Y${stabilizationYear})`,
      path: "stabilization_disposition",
      timing: toTiming(stabilizationYear, null, stabilizationYear),
      exitValue: stabilizationMetrics.exitValue,
      equityProceeds: stabilizationMetrics.equityProceeds,
      equityMultiple: stabilizationMetrics.equityMultiple,
      irrPct: stabilizationMetrics.irrPct,
      irrMaximizingExitTiming: toTiming(stabilizationYear, null, stabilizationYear),
    };

    const bestSell = sellScenarios.reduce<ExitScenarioRow | null>(
      (best, scenario) =>
        !best || irrScore(scenario.irrPct) > irrScore(best.irrPct) ? scenario : best,
      null,
    );
    const bestRefinance = refinanceScenarios.reduce<ExitScenarioRow | null>(
      (best, scenario) =>
        !best || irrScore(scenario.irrPct) > irrScore(best.irrPct) ? scenario : best,
      null,
    );

    const sellTiming = bestSell?.timing ?? toTiming(horizon, null, horizon);
    const refinanceTiming = bestRefinance?.timing ?? toTiming(horizon, 1, horizon);

    const scenarios = [...sellScenarios, ...refinanceScenarios, stabilizationScenario];
    for (const scenario of scenarios) {
      if (scenario.path === "sell") {
        scenario.irrMaximizingExitTiming = sellTiming;
      } else if (scenario.path === "refinance_hold") {
        scenario.irrMaximizingExitTiming = refinanceTiming;
      } else {
        scenario.irrMaximizingExitTiming = stabilizationScenario.timing;
      }
    }

    const rankedScenarios = [...scenarios].sort((a, b) => {
      const irrDelta = irrScore(b.irrPct) - irrScore(a.irrPct);
      if (irrDelta !== 0) {
        return irrDelta;
      }
      return b.equityMultiple - a.equityMultiple;
    });

    return JSON.stringify({
      dealId,
      scenarios: rankedScenarios,
      summary: {
        sellIrrMaxTiming: bestSell?.timing ?? null,
        refinanceIrrMaxTiming: bestRefinance?.timing ?? null,
        stabilizationTiming: stabilizationScenario.timing,
        overallBestScenarioId: rankedScenarios[0]?.id ?? null,
      },
    });
  },
});

export const recommend_entitlement_path = tool({
  name: "recommend_entitlement_path",
  description:
    "Recommend an entitlement strategy path with approval probability, timeline, costs, ranked alternatives, and risk flags.",
  parameters: z.object({
    jurisdiction_id: z.string().nullable(),
    sku: z.string(),
    proposed_use: z.string(),
    site_constraints: z.array(z.string()).nullable(),
    risk_tolerance: z.enum(["conservative", "moderate", "aggressive"]),
  }),
  execute: async ({
    jurisdiction_id,
    sku,
    proposed_use,
    site_constraints,
    risk_tolerance,
  }) => {
    const constraints = (site_constraints ?? []).map((item) => item.toLowerCase());
    const hasWetlands = constraints.some((item) => item.includes("wetland"));
    const hasFlood = constraints.some((item) => item.includes("flood"));
    const hasAccess = constraints.some((item) => item.includes("access"));
    const hasAdjacency = constraints.some((item) => item.includes("adjacen"));

    const baseOptions = [
      {
        path: "CUP",
        approvalProbability: 0.74,
        expectedTimelineMonths: 5.5,
        estimatedCost: 45_000,
      },
      {
        path: "REZONING",
        approvalProbability: 0.62,
        expectedTimelineMonths: 9,
        estimatedCost: 85_000,
      },
      {
        path: "VARIANCE",
        approvalProbability: 0.68,
        expectedTimelineMonths: 6.5,
        estimatedCost: 55_000,
      },
    ];

    const adjusted = baseOptions.map((option) => {
      let probability = option.approvalProbability;
      let months = option.expectedTimelineMonths;
      let cost = option.estimatedCost;

      if (hasWetlands) {
        probability -= 0.08;
        months += 1.5;
        cost += 18_000;
      }
      if (hasFlood) {
        probability -= 0.05;
        months += 1;
        cost += 12_000;
      }
      if (hasAccess) {
        probability -= 0.04;
        months += 0.75;
        cost += 8_000;
      }
      if (hasAdjacency) {
        probability -= 0.03;
        months += 0.5;
        cost += 6_000;
      }
      if (risk_tolerance === "conservative" && option.path === "REZONING") {
        probability -= 0.04;
      }
      if (risk_tolerance === "aggressive" && option.path === "REZONING") {
        probability += 0.03;
      }
      if (proposed_use.toLowerCase().includes("industrial") && option.path === "CUP") {
        probability -= 0.03;
      }
      if (sku.toLowerCase().includes("truck") && option.path === "VARIANCE") {
        probability -= 0.02;
      }

      const boundedProbability = Math.max(0.2, Math.min(0.92, probability));
      const boundedMonths = Math.max(2, months);
      const score = round(boundedProbability * 100 - boundedMonths * 2.5 - cost / 10_000, 2);

      return {
        ...option,
        approvalProbability: round(boundedProbability, 4),
        expectedTimelineMonths: round(boundedMonths, 1),
        estimatedCost: Math.round(cost),
        score,
      };
    });

    adjusted.sort((a, b) => b.score - a.score);
    const recommended = adjusted[0];

    const riskFlags = [
      hasWetlands ? "wetlands_permitting_risk" : null,
      hasFlood ? "floodplain_mitigation_risk" : null,
      hasAccess ? "access_easement_or_dotd_risk" : null,
      hasAdjacency ? "neighbor_opposition_risk" : null,
      jurisdiction_id ? null : "missing_jurisdiction_reference",
    ].filter((value): value is string => value !== null);

    return JSON.stringify({
      jurisdiction_id,
      sku,
      proposed_use,
      recommended_path: {
        path: recommended.path,
        approval_probability: recommended.approvalProbability,
        expected_timeline_months: recommended.expectedTimelineMonths,
        estimated_cost: recommended.estimatedCost,
      },
      alternatives_ranked: adjusted.slice(1, 4).map((option, idx) => ({
        rank: idx + 2,
        path: option.path,
        approval_probability: option.approvalProbability,
        expected_timeline_months: option.expectedTimelineMonths,
        estimated_cost: option.estimatedCost,
      })),
      risk_flags: riskFlags,
    });
  },
});

export const analyze_comparable_sales = tool({
  name: "analyze_comparable_sales",
  description:
    "Analyze comparable sales with time adjustments and return valuation range, recommended offer, and market strength.",
  parameters: z.object({
    parcel_address: z.string(),
    acreage: z.number(),
    sku_type: z.string(),
    comps: z.array(
      z.object({
        address: z.string(),
        salePrice: z.number(),
        acreage: z.number(),
        saleDate: z.string(),
      }),
    ),
  }),
  execute: async ({ parcel_address, acreage, sku_type, comps }) => {
    if (!Array.isArray(comps) || comps.length === 0) {
      return JSON.stringify({ error: "At least one comparable sale is required" });
    }

    const now = new Date();
    const adjusted = comps.map((comp) => {
      const saleDate = new Date(comp.saleDate);
      const ageMonths = Number.isNaN(saleDate.getTime())
        ? 0
        : Math.max(0, (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
      const timeAdjustmentPct = Math.min(0.24, ageMonths * 0.0025);
      const basePpa = comp.acreage > 0 ? comp.salePrice / comp.acreage : 0;
      const adjustedPpa = basePpa * (1 + timeAdjustmentPct);
      const adjustedValue = adjustedPpa * Math.max(acreage, 0.1);

      return {
        address: comp.address,
        sale_price: Math.round(comp.salePrice),
        acreage: round(comp.acreage, 3),
        sale_date: comp.saleDate,
        base_price_per_acre: Math.round(basePpa),
        time_adjustment_pct: round(timeAdjustmentPct * 100, 2),
        adjusted_price_per_acre: Math.round(adjustedPpa),
        adjusted_value_for_subject: Math.round(adjustedValue),
      };
    });

    const ppaSeries = adjusted
      .map((row) => row.adjusted_price_per_acre)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    const lowPpa = ppaSeries[Math.max(0, Math.floor(ppaSeries.length * 0.2))] ?? 0;
    const midPpa = ppaSeries[Math.max(0, Math.floor(ppaSeries.length * 0.5))] ?? 0;
    const highPpa = ppaSeries[Math.max(0, Math.floor(ppaSeries.length * 0.8))] ?? 0;

    const low = Math.round(lowPpa * acreage);
    const mid = Math.round(midPpa * acreage);
    const high = Math.round(highPpa * acreage);
    const recommendedOffer = Math.round(mid * 0.96);

    const dispersion =
      midPpa > 0 ? (highPpa - lowPpa) / midPpa : 0;
    const marketStrengthIndicator =
      dispersion < 0.2 ? "strong" : dispersion < 0.4 ? "balanced" : "soft";

    return JSON.stringify({
      parcel_address,
      sku_type,
      subject_acreage: round(acreage, 3),
      adjusted_comps: adjusted,
      valuation_range: {
        low,
        mid,
        high,
      },
      recommended_offer_price: recommendedOffer,
      market_strength_indicator: marketStrengthIndicator,
    });
  },
});

export const optimize_debt_structure = tool({
  name: "optimize_debt_structure",
  description:
    "Rank debt structures and return conservative/moderate/aggressive options with equity, DSCR, levered IRR, and risk score.",
  parameters: z.object({
    purchase_price: z.number(),
    noi: z.number(),
    available_equity: z.number(),
    risk_tolerance: z.enum(["conservative", "moderate", "aggressive"]),
    debt_options: z.array(
      z.object({
        lenderType: z.string(),
        maxLoan: z.number(),
        interestRate: z.number(),
        term: z.number().int().positive(),
        dscrRequired: z.number(),
      }),
    ),
  }),
  execute: async ({
    purchase_price,
    noi,
    available_equity,
    risk_tolerance,
    debt_options,
  }) => {
    if (!debt_options.length || purchase_price <= 0) {
      return JSON.stringify({ error: "Debt options and purchase price are required" });
    }

    const annualDebtService = (loan: number, annualRatePct: number, termYears: number): number => {
      const monthlyRate = annualRatePct / 100 / 12;
      const periods = Math.max(1, termYears * 12);
      if (monthlyRate <= 0) return loan / periods * 12;
      const monthlyPayment =
        (loan * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -periods));
      return monthlyPayment * 12;
    };

    const baseCapRate = noi > 0 ? noi / purchase_price : 0;

    const candidates = debt_options
      .map((option) => {
        const maxDebt = Math.min(option.maxLoan, purchase_price);
        const debtService = annualDebtService(maxDebt, option.interestRate, option.term);
        const dscr = debtService > 0 ? noi / debtService : 0;
        const equityRequired = Math.max(0, purchase_price - maxDebt);
        const leverage = maxDebt / purchase_price;
        const spread = baseCapRate - option.interestRate / 100;
        const leveredIrr = baseCapRate + spread * leverage * 1.35;
        const riskPenalty = Math.max(0, leverage - 0.7) * 120 + Math.max(0, option.interestRate - 7);
        const riskScore = Math.max(
          0,
          Math.min(100, Math.round(55 + (1.25 - dscr) * 45 + riskPenalty)),
        );

        return {
          lender_type: option.lenderType,
          debt_amount: Math.round(maxDebt),
          equity_required: Math.round(equityRequired),
          dscr: round(dscr, 3),
          levered_irr: round(leveredIrr * 100, 2),
          risk_score: riskScore,
          feasible:
            dscr >= option.dscrRequired &&
            equityRequired <= available_equity,
        };
      })
      .filter((candidate) => candidate.feasible);

    if (candidates.length === 0) {
      return JSON.stringify({
        error: "No feasible structure for current equity + DSCR constraints",
      });
    }

    const byConservative = [...candidates].sort(
      (a, b) => a.risk_score - b.risk_score || b.levered_irr - a.levered_irr,
    );
    const byAggressive = [...candidates].sort(
      (a, b) => b.levered_irr - a.levered_irr || a.risk_score - b.risk_score,
    );
    const byModerate = [...candidates].sort(
      (a, b) =>
        Math.abs(a.risk_score - 55) - Math.abs(b.risk_score - 55) ||
        b.levered_irr - a.levered_irr,
    );

    const structures = [
      { profile: "conservative", value: byConservative[0] },
      { profile: "moderate", value: byModerate[0] },
      { profile: "aggressive", value: byAggressive[0] },
    ];

    const ranked = structures.map((structure) => ({
      profile: structure.profile,
      ...structure.value,
      recommended: structure.profile === risk_tolerance,
    }));

    return JSON.stringify({
      purchase_price: Math.round(purchase_price),
      noi: Math.round(noi),
      available_equity: Math.round(available_equity),
      ranked_structures: ranked,
    });
  },
});

export const estimate_phase_ii_scope = tool({
  name: "estimate_phase_ii_scope",
  description:
    "Estimate Phase II ESA scope, timeline, cost bands, remediation risk, and probable remediation range from Phase I RECs.",
  parameters: z.object({
    phase_i_recs: z.array(z.string()),
    site_acreage: z.number(),
    groundwater_depth: z.number().nullable(),
  }),
  execute: async ({ phase_i_recs, site_acreage, groundwater_depth }) => {
    const recs = phase_i_recs.map((item) => item.toLowerCase());
    const hasUst = recs.some((item) => item.includes("ust") || item.includes("tank"));
    const hasVapor = recs.some((item) => item.includes("vapor"));
    const hasSolvent = recs.some((item) => item.includes("solvent") || item.includes("dry clean"));
    const hasFill = recs.some((item) => item.includes("fill") || item.includes("debris"));

    let riskScore = 35 + recs.length * 6;
    if (hasUst) riskScore += 15;
    if (hasVapor) riskScore += 10;
    if (hasSolvent) riskScore += 12;
    if (hasFill) riskScore += 8;
    if (groundwater_depth !== null && groundwater_depth <= 12) riskScore += 10;
    if (groundwater_depth !== null && groundwater_depth >= 40) riskScore -= 4;
    riskScore = Math.max(10, Math.min(95, riskScore));

    const baseCost = 22_000 + Math.max(site_acreage, 0) * 7_000;
    const low = Math.round(baseCost * (0.75 + riskScore / 400));
    const mid = Math.round(baseCost * (1 + riskScore / 220));
    const high = Math.round(baseCost * (1.35 + riskScore / 160));

    const remediationLow = Math.round(low * (0.6 + riskScore / 250));
    const remediationMid = Math.round(mid * (0.85 + riskScore / 180));
    const remediationHigh = Math.round(high * (1.15 + riskScore / 140));

    const timelineWeeks = {
      low: Math.max(3, Math.round(4 + riskScore / 18)),
      mid: Math.max(5, Math.round(6 + riskScore / 14)),
      high: Math.max(7, Math.round(8 + riskScore / 11)),
    };

    const scopeParts = [
      hasUst ? "targeted tank basin borings" : null,
      hasSolvent ? "VOC panel and chlorinated solvent suite" : null,
      hasVapor ? "sub-slab soil gas screening" : null,
      hasFill ? "fill material metals/PAH characterization" : "baseline soil/groundwater screening",
    ].filter((value): value is string => value !== null);

    return JSON.stringify({
      phase_i_recs,
      site_acreage: round(site_acreage, 3),
      groundwater_depth,
      phase_ii_cost_range: { low, mid, high },
      timeline_weeks: timelineWeeks,
      remediation_scope_description: `Recommended scope includes ${scopeParts.join(", ")}.`,
      remediation_cost_range: {
        low: remediationLow,
        mid: remediationMid,
        high: remediationHigh,
      },
      probability_remediation_required: round(riskScore / 100, 3),
    });
  },
});

export const analyze_title_commitment = tool({
  name: "analyze_title_commitment",
  description:
    "Analyze title commitment text and return categorized exceptions, lien severity, easement impact, insurance estimate, and cure plan.",
  parameters: z.object({
    title_commitment_text: z.string(),
    deal_type: z.string(),
  }),
  execute: async ({ title_commitment_text, deal_type }) => {
    const lines = title_commitment_text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const exceptionLines = lines.filter((line) =>
      /exception|subject to|encumbrance|restriction/i.test(line),
    );
    const lienLines = lines.filter((line) =>
      /lien|mortgage|judgment|tax|ucc/i.test(line),
    );
    const easementLines = lines.filter((line) =>
      /easement|right[- ]of[- ]way|servitude|access agreement/i.test(line),
    );

    const categorizedExceptions = exceptionLines.slice(0, 20).map((line) => ({
      item: line,
      category: /tax|assessment|lien|mortgage/i.test(line)
        ? "financial_encumbrance"
        : /easement|right[- ]of[- ]way|servitude/i.test(line)
          ? "use_restriction"
          : "general_exception",
    }));

    const liens = lienLines.slice(0, 20).map((line) => ({
      item: line,
      severity: /tax|judgment|federal/i.test(line)
        ? "critical"
        : /mortgage|deed of trust|ucc/i.test(line)
          ? "high"
          : "medium",
    }));

    const easementImpactDescription =
      easementLines.length === 0
        ? "No material easement burden identified in extracted text."
        : `${easementLines.length} easement/right-of-way item(s) may constrain site planning and access layout.`;

    const moneyMatches = [...title_commitment_text.matchAll(/\$?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g)]
      .map((match) => Number(match[0].replace(/[$,]/g, "")))
      .filter((value) => Number.isFinite(value));
    const policyAmount =
      moneyMatches.length > 0 ? Math.max(...moneyMatches) : 1_000_000;
    const insuranceRate =
      /raw land|land/i.test(deal_type) ? 0.0032 : 0.0043;
    const titleInsuranceCostEstimate = Math.round(policyAmount * insuranceRate);

    const cureItems = liens.slice(0, 8).map((lien, idx) => ({
      item: lien.item,
      estimated_cost: Math.round(titleInsuranceCostEstimate * (0.08 + idx * 0.01)),
      timeline_days: lien.severity === "critical" ? 45 : lien.severity === "high" ? 30 : 21,
    }));

    return JSON.stringify({
      categorized_exceptions: categorizedExceptions,
      liens,
      easement_impact_description: easementImpactDescription,
      title_insurance_cost_estimate: titleInsuranceCostEstimate,
      cure_items: cureItems,
    });
  },
});

export const generate_zoning_compliance_checklist = tool({
  name: "generate_zoning_compliance_checklist",
  description:
    "Generate requirement-level zoning compliance matrix with variance counts, likelihood, and aggregate variance timing/cost estimates.",
  parameters: z.object({
    jurisdiction_id: z.string().nullable(),
    sku: z.string(),
    current_zoning: z.string().nullable(),
    site_constraints: z.object({
      acreage: z.number().nullable(),
      proposed_height: z.number().nullable(),
      parking_spaces: z.number().nullable(),
      far: z.number().nullable(),
    }),
  }),
  execute: async ({ jurisdiction_id, sku, current_zoning, site_constraints }) => {
    const zoning = (current_zoning ?? "UNKNOWN").toUpperCase();
    const acreage = site_constraints.acreage ?? 0;
    const proposedHeight = site_constraints.proposed_height ?? 0;
    const proposedParking = site_constraints.parking_spaces ?? 0;
    const proposedFar = site_constraints.far ?? 0;

    const requiredMaxHeight =
      zoning.startsWith("M-") ? 85 : zoning.startsWith("C-") ? 60 : 45;
    const requiredMaxFar =
      zoning.startsWith("M-") ? 2.0 : zoning.startsWith("C-") ? 1.5 : 1.0;
    const requiredParking =
      Math.max(4, Math.round((sku.toLowerCase().includes("truck") ? 1.2 : 2.4) * Math.max(acreage, 1)));
    const requiredMinAcreage =
      sku.toLowerCase().includes("truck") ? 3 : sku.toLowerCase().includes("storage") ? 2 : 1;

    const checklist = [
      {
        item: "Minimum Site Acreage",
        required: `${requiredMinAcreage.toFixed(1)} acres min`,
        proposed: acreage > 0 ? `${round(acreage, 2)} acres` : "Not provided",
        compliant: acreage >= requiredMinAcreage,
      },
      {
        item: "Maximum Building Height",
        required: `${requiredMaxHeight} ft max`,
        proposed: proposedHeight > 0 ? `${round(proposedHeight, 1)} ft` : "Not provided",
        compliant: proposedHeight > 0 ? proposedHeight <= requiredMaxHeight : false,
      },
      {
        item: "Parking Supply",
        required: `${requiredParking} spaces min`,
        proposed: proposedParking > 0 ? `${Math.round(proposedParking)} spaces` : "Not provided",
        compliant: proposedParking >= requiredParking,
      },
      {
        item: "Floor Area Ratio (FAR)",
        required: `${requiredMaxFar.toFixed(2)} FAR max`,
        proposed: proposedFar > 0 ? round(proposedFar, 2).toFixed(2) : "Not provided",
        compliant: proposedFar > 0 ? proposedFar <= requiredMaxFar : false,
      },
    ].map((row) => {
      const varianceNeeded = !row.compliant;
      return {
        ...row,
        variance_needed: varianceNeeded,
        variance_likelihood: varianceNeeded ? "moderate" : "low",
      };
    });

    const totalVarianceCount = checklist.filter((row) => row.variance_needed).length;
    const estimatedVarianceCost = totalVarianceCount * 18_500;
    const estimatedVarianceTimelineMonths = round(totalVarianceCount * 2.5, 1);

    return JSON.stringify({
      jurisdiction_id,
      sku,
      current_zoning,
      compliance_matrix: checklist,
      total_variance_count: totalVarianceCount,
      estimated_variance_cost: estimatedVarianceCost,
      estimated_variance_timeline_months: estimatedVarianceTimelineMonths,
    });
  },
});

export const addParcelToDeal = tool({
  name: "add_parcel_to_deal",
  description: "Attach a parcel (by address and optional details) to a deal",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal to attach the parcel to"),
    address: z.string().min(1).describe("Street address of the parcel"),
    apn: z.string().nullable().describe("Assessor parcel number"),
    lat: z.number().nullable().describe("Latitude"),
    lng: z.number().nullable().describe("Longitude"),
    acreage: z.number().nullable().describe("Acreage of the parcel"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code (e.g. A1, C2, M1)"),
    futureLandUse: z
      .string()
      .nullable()
      .describe("Future land use designation"),
    utilitiesNotes: z
      .string()
      .nullable()
      .describe("Notes about utility access"),
  }),
  execute: async ({
    orgId,
    dealId,
    address,
    apn,
    lat,
    lng,
    acreage,
    currentZoning,
    futureLandUse,
    utilitiesNotes,
  }) => {
    // Verify the deal belongs to the org
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const parcel = await prisma.parcel.create({
      data: {
        orgId,
        dealId,
        address,
        apn: apn ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        acreage: acreage ?? null,
        currentZoning: currentZoning ?? null,
        futureLandUse: futureLandUse ?? null,
        utilitiesNotes: utilitiesNotes ?? null,
      },
    });
    return JSON.stringify(parcel);
  },
});

export const updateParcel = tool({
  name: "update_parcel",
  description:
    "Update an existing parcel with enriched data (coordinates, APN, acreage, zoning, etc.). Use this after scanning the property database and getting user approval to associate the findings with the deal.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    parcelId: z.string().uuid().describe("The parcel ID to update"),
    apn: z.string().nullable().describe("Assessor parcel number"),
    lat: z.number().nullable().describe("Latitude"),
    lng: z.number().nullable().describe("Longitude"),
    acreage: z.number().nullable().describe("Acreage of the parcel"),
    currentZoning: z
      .string()
      .nullable()
      .describe("Current zoning code (e.g. A1, C2, M1)"),
    futureLandUse: z
      .string()
      .nullable()
      .describe("Future land use designation"),
    utilitiesNotes: z
      .string()
      .nullable()
      .describe("Notes about utility access"),
    floodZone: z
      .string()
      .nullable()
      .describe("FEMA flood zone code (e.g. X, AE, A)"),
    soilsNotes: z
      .string()
      .nullable()
      .describe("Summary of soil conditions from screening"),
    wetlandsNotes: z
      .string()
      .nullable()
      .describe("Summary of wetland status from screening"),
    envNotes: z
      .string()
      .nullable()
      .describe("Summary of environmental screening (EPA/LDEQ findings)"),
    trafficNotes: z
      .string()
      .nullable()
      .describe("Summary of traffic/access data from screening"),
    propertyDbId: z
      .string()
      .uuid()
      .nullable()
      .describe("The parcel UUID from the Louisiana Property Database, for cross-reference"),
  }),
  execute: async ({
    orgId,
    parcelId,
    apn,
    lat,
    lng,
    acreage,
    currentZoning,
    futureLandUse,
    utilitiesNotes,
    floodZone,
    soilsNotes,
    wetlandsNotes,
    envNotes,
    trafficNotes,
    propertyDbId,
  }) => {
    // Only update fields that were provided (non-null)
    const data: Record<string, unknown> = {};
    if (apn != null) data.apn = apn;
    if (lat != null) data.lat = lat;
    if (lng != null) data.lng = lng;
    if (acreage != null) data.acreage = acreage;
    if (currentZoning != null) data.currentZoning = currentZoning;
    if (futureLandUse != null) data.futureLandUse = futureLandUse;
    if (utilitiesNotes != null) data.utilitiesNotes = utilitiesNotes;
    if (floodZone != null) data.floodZone = floodZone;
    if (soilsNotes != null) data.soilsNotes = soilsNotes;
    if (wetlandsNotes != null) data.wetlandsNotes = wetlandsNotes;
    if (envNotes != null) data.envNotes = envNotes;
    if (trafficNotes != null) data.trafficNotes = trafficNotes;
    if (propertyDbId != null) data.propertyDbId = propertyDbId;

    if (Object.keys(data).length === 0) {
      return JSON.stringify({ error: "No fields to update" });
    }

    const result = await prisma.parcel.updateMany({
      where: { id: parcelId, orgId },
      data,
    });

    if (result.count === 0) {
      return JSON.stringify({ error: "Parcel not found or access denied" });
    }

    const updated = await prisma.parcel.findFirstOrThrow({
      where: { id: parcelId, orgId },
    });
    return JSON.stringify(updated);
  },
});
