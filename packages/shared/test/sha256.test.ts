import { describe, expect, it } from "vitest";

import { hashJsonSha256, stableJsonStringify } from "../src/crypto/sha256.js";

describe("stableJsonStringify", () => {
  it("produces deterministic key ordering for objects", () => {
    const a = { b: 2, a: 1, c: { z: 1, y: 2 } };
    const b = { c: { y: 2, z: 1 }, a: 1, b: 2 };

    expect(stableJsonStringify(a)).toEqual(stableJsonStringify(b));
  });

  it("throws for non-JSON-serializable root values", () => {
    expect(() => stableJsonStringify(undefined)).toThrow(/not JSON-serializable/i);
  });
});

describe("hashJsonSha256", () => {
  it("is stable for semantically equal objects with different key insertion order", () => {
    const a = { a: 1, b: 2, c: { d: [3, 4] } };
    const b = { c: { d: [3, 4] }, b: 2, a: 1 };

    expect(hashJsonSha256(a)).toEqual(hashJsonSha256(b));
  });

  it("changes when the value changes", () => {
    const a = { a: 1, b: 2 };
    const b = { a: 1, b: 3 };

    expect(hashJsonSha256(a)).not.toEqual(hashJsonSha256(b));
  });
});

