import { describe, expect, it } from "vitest";

import { hydrateRequiredNullableToolArgs } from "./toolInvokeInput";

describe("hydrateRequiredNullableToolArgs", () => {
  it("fills missing required-nullable properties with null", () => {
    const schema = {
      type: "object",
      properties: {
        orgId: { type: "string" },
        query: { type: "string" },
        parish: { anyOf: [{ type: "string" }, { type: "null" }] },
        minScore: { anyOf: [{ type: "number" }, { type: "null" }] },
        topK: { anyOf: [{ type: "number" }, { type: "null" }] },
      },
      required: ["orgId", "query", "parish", "minScore", "topK"],
    };

    expect(
      hydrateRequiredNullableToolArgs(schema, {
        orgId: "11111111-1111-4111-8111-111111111111",
        query: "flood zone parcels",
      }),
    ).toEqual({
      orgId: "11111111-1111-4111-8111-111111111111",
      query: "flood zone parcels",
      parish: null,
      minScore: null,
      topK: null,
    });
  });

  it("preserves provided values and leaves non-nullable missing properties untouched", () => {
    const schema = {
      type: "object",
      properties: {
        orgId: { type: "string" },
        query: { type: "string" },
        parish: { anyOf: [{ type: "string" }, { type: "null" }] },
        limit: { type: "number" },
      },
      required: ["orgId", "query", "parish", "limit"],
    };

    expect(
      hydrateRequiredNullableToolArgs(schema, {
        orgId: "11111111-1111-4111-8111-111111111111",
        query: "industrial parcels",
        parish: "East Baton Rouge",
      }),
    ).toEqual({
      orgId: "11111111-1111-4111-8111-111111111111",
      query: "industrial parcels",
      parish: "East Baton Rouge",
    });
  });
});
