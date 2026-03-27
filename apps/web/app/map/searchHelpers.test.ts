import { describe, expect, it } from "vitest";
import {
  buildSuggestionLookupText,
  canonicalizeParcelSearchText,
  isLikelyMapAnalysisQuery,
  isLikelyParcelLookupQuery,
} from "./searchHelpers";

describe("searchHelpers", () => {
  it("normalizes street suffix variants for direct parcel lookup", () => {
    expect(canonicalizeParcelSearchText("3154 College Dr.")).toBe("3154 college drive");
  });

  it("treats a numbered street address as a parcel lookup query", () => {
    expect(isLikelyParcelLookupQuery("3154 College Drive")).toBe(true);
    expect(isLikelyMapAnalysisQuery("3154 College Drive")).toBe(false);
  });

  it("treats spatial analysis prompts as analysis queries", () => {
    expect(isLikelyMapAnalysisQuery("find flood risk within 10 minutes of downtown")).toBe(
      true,
    );
    expect(
      isLikelyParcelLookupQuery("find flood risk within 10 minutes of downtown"),
    ).toBe(false);
  });

  it("prefers property database ids when building lookup text", () => {
    expect(
      buildSuggestionLookupText({
        id: "parcel-1",
        address: "123 Main St",
        lat: 30.45,
        lng: -91.18,
        propertyDbId: "property-1",
      }),
    ).toBe("property-1");
  });
});
