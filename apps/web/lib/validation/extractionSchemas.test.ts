import { describe, expect, it } from "vitest";

import {
  DOC_TYPE_LABELS,
  DocTypeSchema,
  EXTRACTION_SCHEMAS,
  RentRollExtractionSchema,
  TrailingFinancialsExtractionSchema,
} from "./extractionSchemas";

describe("validation extraction schemas", () => {
  it("accepts new document types in DocTypeSchema", () => {
    expect(DocTypeSchema.parse("rent_roll")).toBe("rent_roll");
    expect(DocTypeSchema.parse("trailing_financials")).toBe("trailing_financials");
  });

  it("registers new doc types in schema map and labels", () => {
    expect(EXTRACTION_SCHEMAS.rent_roll).toBe(RentRollExtractionSchema);
    expect(EXTRACTION_SCHEMAS.trailing_financials).toBe(TrailingFinancialsExtractionSchema);

    expect(DOC_TYPE_LABELS.rent_roll).toBe("Rent Roll");
    expect(DOC_TYPE_LABELS.trailing_financials).toBe("Trailing Financials (T3/T6/T12)");
  });

  it("exposes expected top-level keys for new extraction payloads", () => {
    expect(Object.keys(RentRollExtractionSchema.shape)).toEqual(
      expect.arrayContaining(["as_of_date", "tenants", "near_term_expirations"]),
    );
    expect(Object.keys(TrailingFinancialsExtractionSchema.shape)).toEqual(
      expect.arrayContaining(["period_type", "noi", "annualized_noi"]),
    );
  });
});
