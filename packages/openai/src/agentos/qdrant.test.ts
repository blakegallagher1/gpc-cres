import { describe, expect, it } from "vitest";
import { buildHashedSparseVector } from "./qdrant.js";

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
});

