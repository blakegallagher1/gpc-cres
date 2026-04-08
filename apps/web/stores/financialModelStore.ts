import { create } from "zustand";

// Pure types and defaults live in `apps/web/lib/financial/assumptions.ts` so
// that server-side services and jobs can import them without pulling zustand
// into a server-only bundle.
export type {
  AcquisitionAssumptions,
  IncomeAssumptions,
  ExpenseAssumptions,
  FinancingAssumptions,
  ExitAssumptions,
  BaseFinancialModelAssumptions,
  StressScenarioId,
  StressScenarioDefinition,
  StressScenarioBundle,
  FinancialModelAssumptions,
} from "@/lib/financial/assumptions";

import {
  DEFAULT_ASSUMPTIONS,
  type AcquisitionAssumptions,
  type IncomeAssumptions,
  type ExpenseAssumptions,
  type FinancingAssumptions,
  type ExitAssumptions,
  type FinancialModelAssumptions,
} from "@/lib/financial/assumptions";

export { DEFAULT_ASSUMPTIONS };

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
