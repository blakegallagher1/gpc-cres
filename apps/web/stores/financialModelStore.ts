import { create } from "zustand";

// ---------------------------------------------------------------------------
// Assumption categories per IMPLEMENTATION_PLAN.md Phase 3A
// ---------------------------------------------------------------------------

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

export interface FinancialModelAssumptions {
  acquisition: AcquisitionAssumptions;
  income: IncomeAssumptions;
  expenses: ExpenseAssumptions;
  financing: FinancingAssumptions;
  exit: ExitAssumptions;
  /** Gross buildable SF — derived from deal parcels or overridden */
  buildableSf: number;
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface FinancialModelState {
  dealId: string | null;
  assumptions: FinancialModelAssumptions;
  dirty: boolean;
  saving: boolean;
  loaded: boolean;

  setDealId: (id: string) => void;
  setAssumptions: (a: FinancialModelAssumptions) => void;
  updateAcquisition: (patch: Partial<AcquisitionAssumptions>) => void;
  updateIncome: (patch: Partial<IncomeAssumptions>) => void;
  updateExpenses: (patch: Partial<ExpenseAssumptions>) => void;
  updateFinancing: (patch: Partial<FinancingAssumptions>) => void;
  updateExit: (patch: Partial<ExitAssumptions>) => void;
  updateBuildableSf: (sf: number) => void;
  resetToDefaults: () => void;
  setSaving: (s: boolean) => void;
  setLoaded: (l: boolean) => void;
  markClean: () => void;
}

export const useFinancialModelStore = create((set): FinancialModelState => ({
  dealId: null,
  assumptions: { ...DEFAULT_ASSUMPTIONS },
  dirty: false,
  saving: false,
  loaded: false,

  setDealId: (id) => set({ dealId: id }),
  setAssumptions: (a) => set({ assumptions: a, dirty: false, loaded: true }),
  updateAcquisition: (patch) =>
    set((s) => ({
      assumptions: {
        ...s.assumptions,
        acquisition: { ...s.assumptions.acquisition, ...patch },
      },
      dirty: true,
    })),
  updateIncome: (patch) =>
    set((s) => ({
      assumptions: {
        ...s.assumptions,
        income: { ...s.assumptions.income, ...patch },
      },
      dirty: true,
    })),
  updateExpenses: (patch) =>
    set((s) => ({
      assumptions: {
        ...s.assumptions,
        expenses: { ...s.assumptions.expenses, ...patch },
      },
      dirty: true,
    })),
  updateFinancing: (patch) =>
    set((s) => ({
      assumptions: {
        ...s.assumptions,
        financing: { ...s.assumptions.financing, ...patch },
      },
      dirty: true,
    })),
  updateExit: (patch) =>
    set((s) => ({
      assumptions: {
        ...s.assumptions,
        exit: { ...s.assumptions.exit, ...patch },
      },
      dirty: true,
    })),
  updateBuildableSf: (sf) =>
    set((s) => ({
      assumptions: { ...s.assumptions, buildableSf: sf },
      dirty: true,
    })),
  resetToDefaults: () => set({ assumptions: { ...DEFAULT_ASSUMPTIONS }, dirty: true }),
  setSaving: (s) => set({ saving: s }),
  setLoaded: (l) => set({ loaded: l }),
  markClean: () => set({ dirty: false }),
}));
