import { describe, expect, it } from "vitest";
import { buildHashedSparseVector, buildQdrantPayloadFilter } from "./qdrant.js";

describe("qdrant sparse vector hashing", () => {
  it("creates deterministic sparse vectors for same input", () => {
    const a = buildHashedSparseVector("Baton Rouge zoning overlay district");
    const b = buildHashedSparseVector("Baton Rouge zoning overlay district");

    expect(a.indices).toEqual(b.indices);
    expect(a.values).toEqual(b.values);
    expect(a.indices.length).toBeGreaterThan(0);
    expect(a.indices.length).toBe(a.values.length);
  });

  it("respects maxTerms bound", () => {
    const vector = buildHashedSparseVector(
      "one two three four five six seven eight nine ten eleven twelve",
      4,
    );
    expect(vector.indices.length).toBeLessThanOrEqual(4);
    expect(vector.values.length).toBeLessThanOrEqual(4);
  });

  it("builds an org-scoped payload filter when orgId is present", () => {
    expect(
      buildQdrantPayloadFilter("org_123", {
        key: "contentType",
        match: { value: "agent_analysis" },
      }),
    ).toEqual({
      must: [
        {
          key: "orgId",
          match: { value: "org_123" },
        },
        {
          key: "contentType",
          match: { value: "agent_analysis" },
        },
      ],
    });
  });

  it("returns only the explicit filter when no orgId is provided", () => {
    expect(
      buildQdrantPayloadFilter(undefined, {
        key: "sourceType",
        match: { value: "knowledge_entry" },
      }),
    ).toEqual({
      must: [
        {
          key: "sourceType",
          match: { value: "knowledge_entry" },
        },
      ],
    });
  });
});
