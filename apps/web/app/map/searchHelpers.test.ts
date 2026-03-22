import { describe, expect, it } from "vitest";
import type { MapParcel } from "@/components/maps/types";
import {
  buildSuggestionLookupText,
  parcelMatchesSearch,
  resolveSuggestionParcel,
} from "./searchHelpers";

const BASE_PARCEL: MapParcel = {
  id: "parcel-1",
  address: "7618 Copperfield Court, Baton Rouge, LA",
  lat: 30.42,
  lng: -91.12,
  propertyDbId: "016-1234-0",
  currentZoning: "C2",
  floodZone: "X",
};

describe("parcelMatchesSearch", () => {
  it("matches canonical street suffix variants", () => {
    expect(parcelMatchesSearch(BASE_PARCEL, "7618 copperfield ct baton rouge")).toBe(true);
  });

  it("matches property database ids", () => {
    expect(parcelMatchesSearch(BASE_PARCEL, "016-1234-0")).toBe(true);
  });
});

describe("buildSuggestionLookupText", () => {
  it("prefers the property database id when one is available", () => {
    expect(
      buildSuggestionLookupText({
        id: "pdb-016-1234-0",
        address: "7618 Copperfield Court, Baton Rouge, LA",
        lat: 30.42,
        lng: -91.12,
        propertyDbId: "016-1234-0",
      }),
    ).toBe("016-1234-0");
  });

  it("falls back to the address when no property database id exists", () => {
    expect(
      buildSuggestionLookupText({
        id: "local-7618-copperfield",
        address: "7618 Copperfield Court, Baton Rouge, LA",
        lat: 30.42,
        lng: -91.12,
        propertyDbId: null,
      }),
    ).toBe("7618 Copperfield Court, Baton Rouge, LA");
  });
});

describe("resolveSuggestionParcel", () => {
  it("matches a rendered parcel by property database id", () => {
    const resolved = resolveSuggestionParcel(
      {
        id: "pdb-016-1234-0",
        address: "7618 Copperfield Court, Baton Rouge, LA",
        lat: 30.42,
        lng: -91.12,
        propertyDbId: "016-1234-0",
      },
      [BASE_PARCEL],
    );

    expect(resolved).toEqual(BASE_PARCEL);
  });

  it("falls back to canonicalized address matching", () => {
    const resolved = resolveSuggestionParcel(
      {
        id: "pdb-missing",
        address: "7618 Copperfield Ct Baton Rouge LA",
        lat: 30.42,
        lng: -91.12,
        propertyDbId: null,
      },
      [BASE_PARCEL],
    );

    expect(resolved).toEqual(BASE_PARCEL);
  });

  it("falls back to coordinate matching when ids and addresses drift", () => {
    const resolved = resolveSuggestionParcel(
      {
        id: "unknown",
        address: "Different address",
        lat: 30.42005,
        lng: -91.12005,
        propertyDbId: null,
      },
      [BASE_PARCEL],
    );

    expect(resolved).toEqual(BASE_PARCEL);
  });
});
