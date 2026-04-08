import { useMemo } from "react";

// Pure proforma math lives in `apps/web/lib/financial/proforma.ts` so that
// server-side services in `packages/server` can import `computeProForma`
// without pulling React into a server-only bundle.
export * from "@/lib/financial/proforma";

import type { FinancialModelAssumptions } from "@/stores/financialModelStore";
import {
  computeProForma,
  type ProFormaResults,
  type ProFormaContext,
} from "@/lib/financial/proforma";

// ---------------------------------------------------------------------------
// Hook — memoized wrapper for React components
// ---------------------------------------------------------------------------

export function useProFormaCalculations(
  assumptions: FinancialModelAssumptions,
  context?: ProFormaContext
): ProFormaResults {
  return useMemo(() => computeProForma(assumptions, context), [assumptions, context]);
}
