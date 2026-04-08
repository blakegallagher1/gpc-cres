export interface AcquisitionAssumptions {
  purchasePrice: number;
  closingCostsPct: number;
  earnestMoney: number;
}

export interface IncomeAssumptions {
  rentPerSf: number;
  vacancyPct: number;
  rentGrowthPct: number;
  otherIncome: number;
}

export interface ExpenseAssumptions {
  opexPerSf: number;
  managementFeePct: number;
  capexReserves: number;
  insurance: number;
  taxes: number;
}

export interface FinancingAssumptions {
  ltvPct: number;
  interestRate: number;
  amortizationYears: number;
  ioPeriodYears: number;
  loanFeePct: number;
}

export interface ExitAssumptions {
  holdYears: number;
  exitCapRate: number;
  dispositionCostsPct: number;
}

export interface BaseFinancialModelAssumptions {
  acquisition: AcquisitionAssumptions;
  income: IncomeAssumptions;
  expenses: ExpenseAssumptions;
  financing: FinancingAssumptions;
  exit: ExitAssumptions;
  buildableSf: number;
}

export type StressScenarioId =
  | "base"
  | "upside"
  | "downside"
  | "rate_shock_200bps"
  | "recession"
  | "tenant_loss";

export interface StressScenarioDefinition {
  id: StressScenarioId;
  name: string;
  probabilityPct: number;
  assumptions: BaseFinancialModelAssumptions;
}

export interface StressScenarioBundle {
  version: 1;
  scenarios: StressScenarioDefinition[];
}

export interface FinancialModelAssumptions extends BaseFinancialModelAssumptions {
  stressScenarioBundle?: StressScenarioBundle;
}

export const DEFAULT_ASSUMPTIONS: FinancialModelAssumptions = {
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
    taxes: 1.0,
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
