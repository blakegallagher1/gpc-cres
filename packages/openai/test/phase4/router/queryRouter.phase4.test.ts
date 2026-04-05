import { describe, expect, it } from "vitest";

import {
  getQueryIntentProfile,
  inferQueryIntentFromDealContext,
  inferQueryIntentFromText,
} from "../../../src/queryRouter.js";

describe("Phase 4 Opportunity OS :: query router", () => {
  it("routes entitlement deals to the existing entitlement intent", () => {
    expect(
      inferQueryIntentFromDealContext({
        strategy: "ENTITLEMENT",
        opportunityKind: "SITE",
      }),
    ).toBe("entitlements");
  });

  it("routes acquisition strategies to acquisition underwriting", () => {
    expect(
      inferQueryIntentFromDealContext({
        strategy: "ACQUISITION",
        opportunityKind: "PROPERTY",
      }),
    ).toBe("acquisition_underwriting");

    expect(
      inferQueryIntentFromDealContext({
        strategy: "GROUND_UP_DEVELOPMENT",
        opportunityKind: "SITE",
      }),
    ).toBe("acquisition_underwriting");
  });

  it("routes value-add and core-plus style strategies to asset management", () => {
    expect(
      inferQueryIntentFromDealContext({
        strategy: "VALUE_ADD",
        opportunityKind: "PROPERTY",
      }),
    ).toBe("asset_management");

    expect(
      inferQueryIntentFromDealContext({
        strategy: "CORE_PLUS",
        opportunityKind: "PROPERTY",
      }),
    ).toBe("asset_management");

    expect(
      inferQueryIntentFromDealContext({
        strategy: "VALUE_ADD_ACQUISITION",
        opportunityKind: "PROPERTY",
      }),
    ).toBe("asset_management");
  });

  it("routes disposition and loan-like contexts to capital markets", () => {
    expect(
      inferQueryIntentFromDealContext({
        strategy: "DISPOSITION",
        opportunityKind: "PROPERTY",
      }),
    ).toBe("capital_markets");

    expect(
      inferQueryIntentFromDealContext({
        strategy: null,
        opportunityKind: "LOAN",
      }),
    ).toBe("capital_markets");
  });

  it("falls back to existing entitlement text routing and profile membership unchanged", () => {
    expect(
      inferQueryIntentFromText("Need planning commission application precedent before hearing"),
    ).toBe(
      "entitlements",
    );
    expect(getQueryIntentProfile("entitlements").specialists).toEqual([
      "entitlements",
      "legal",
      "research",
    ]);
  });

  it("treats query_property_db_sql as valid parcel context proof for land search", () => {
    const profile = getQueryIntentProfile("land_search");
    const parcelGroup = profile.proofGroups.find((group) => group.label === "Parcel context");
    expect(parcelGroup).toBeDefined();
    expect(parcelGroup?.tools).toContain("query_property_db_sql");
  });
});
