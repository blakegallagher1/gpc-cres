import { describe, it, expect } from "vitest";
import { buildCacheKey } from "../src/cache";

describe("buildCacheKey", () => {
  it("converts pathname to colon-separated key", () => {
    expect(buildCacheKey("/parcels/search")).toBe(":parcels:search");
  });

  it("appends sorted params", () => {
    const params = new URLSearchParams({ limit: "10", address: "Main St" });
    const key = buildCacheKey("/parcels/search", params);
    expect(key).toBe(":parcels:search:address=Main+St&limit=10");
  });

  it("omits params when empty", () => {
    expect(buildCacheKey("/parcels/ABC", new URLSearchParams())).toBe(":parcels:ABC");
  });

  it("handles params without pathname change", () => {
    const params = new URLSearchParams({ q: "test" });
    expect(buildCacheKey("/search", params)).toBe(":search:q=test");
  });
});
