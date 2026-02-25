import { describe, expect, it } from "vitest";

import {
  DOC_TYPE_LABELS,
  EXTRACTION_SCHEMAS,
  FIELD_LABELS,
  RentRollExtractionSchema,
  TrailingFinancialsExtractionSchema,
} from "./extractionSchemas";

describe("extractionSchemas", () => {
  it("registers rent roll and trailing financials schema doc types", () => {
    expect(EXTRACTION_SCHEMAS.rent_roll).toBe(RentRollExtractionSchema);
    expect(EXTRACTION_SCHEMAS.trailing_financials).toBe(TrailingFinancialsExtractionSchema);
  });

  it("exposes key field labels for new doc types", () => {
    expect(FIELD_LABELS.rent_roll).toMatchObject({
      as_of_date: "As-of Date",
      tenants: "Tenant Schedule",
      near_term_expirations: "Near-Term Expirations",
    });
    expect(FIELD_LABELS.trailing_financials).toMatchObject({
      period_type: "Period Type",
      noi: "NOI",
      annualized_noi: "Annualized NOI",
    });
  });

  it("exposes doc type labels for new doc types", () => {
    expect(DOC_TYPE_LABELS.rent_roll).toBe("Rent Roll");
    expect(DOC_TYPE_LABELS.trailing_financials).toBe("Trailing Financials (T3/T6/T12)");
  });

  it("includes expected schema keys for new schemas", () => {
    expect(Object.keys(RentRollExtractionSchema.shape)).toEqual(
      expect.arrayContaining(["as_of_date", "tenants", "near_term_expirations"]),
    );
    expect(Object.keys(TrailingFinancialsExtractionSchema.shape)).toEqual(
      expect.arrayContaining(["period_type", "noi", "annualized_noi"]),
    );
  });
});
