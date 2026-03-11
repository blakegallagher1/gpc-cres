import { describe, expect, it } from "vitest";

import {
  createToolResultWithMap,
  extractTextFromToolResult,
  parseToolResultMapFeatures,
} from "../toolResultWrapper";

const mapFeatures = [
  {
    parcelId: "parcel-1",
    address: "123 Main St",
    label: "123 Main St",
    center: { lat: 30.45, lng: -91.18 },
  },
];

describe("toolResultWrapper", () => {
  it("wraps tool text with structured map features", () => {
    const wrapped = createToolResultWithMap("Found 1 parcel", mapFeatures);

    expect(parseToolResultMapFeatures(wrapped)).toEqual(mapFeatures);
    expect(extractTextFromToolResult(wrapped)).toBe("Found 1 parcel");
  });

  it("returns the raw text when no map features are present", () => {
    expect(createToolResultWithMap("No geometry available", [])).toBe(
      "No geometry available",
    );
    expect(parseToolResultMapFeatures("No geometry available")).toBeNull();
    expect(extractTextFromToolResult("No geometry available")).toBe(
      "No geometry available",
    );
  });

  it("handles wrapped object results in addition to wrapped JSON strings", () => {
    const wrappedObject = {
      text: "Completed parcel search",
      __mapFeatures: mapFeatures,
    };

    expect(parseToolResultMapFeatures(wrappedObject)).toEqual(mapFeatures);
    expect(extractTextFromToolResult(wrappedObject)).toBe(
      "Completed parcel search",
    );
  });
});
