import { describe, expect, it } from "vitest";

import { computeProForma } from "@/hooks/useProFormaCalculations";
import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";

describe("computeProForma C6 tax integration", () => {
  it("computes and surfaces pre-tax vs after-tax IRR", () => {
    const result = computeProForma(DEFAULT_ASSUMPTIONS, {
      dealSku: "SMALL_BAY_FLEX",
    });

    expect(result.preTaxIRR).toBe(result.leveredIRR);
    expect(result.afterTaxIRR).not.toBeNull();
    expect(result.taxImpact.preTaxIRR).toBe(result.preTaxIRR);
    expect(result.taxImpact.afterTaxIRR).toBe(result.afterTaxIRR);
    expect(result.taxImpact.estimatedDispositionTax).toBeGreaterThan(0);
    expect(result.taxImpact.annualDepreciationDeductions).toHaveLength(
      DEFAULT_ASSUMPTIONS.exit.holdYears,
    );

    if (result.preTaxIRR !== null && result.afterTaxIRR !== null) {
      expect(result.afterTaxIRR).toBeLessThanOrEqual(result.preTaxIRR);
    }
  });

  it("wires 1031 deadlines to DealTerms closing date", () => {
    const result = computeProForma(DEFAULT_ASSUMPTIONS, {
      dealTermsClosingDate: "2026-03-15",
      dealSku: "OUTDOOR_STORAGE",
    });

    expect(result.exchange1031).not.toBeNull();
    expect(result.exchange1031?.saleCloseDate).toBe("2026-03-15");
    expect(result.exchange1031?.identificationDeadline).toBe("2026-04-29");
    expect(result.exchange1031?.closingDeadline).toBe("2026-09-11");
  });
});
