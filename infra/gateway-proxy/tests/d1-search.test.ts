import { describe, it, expect } from "vitest";

describe("d1-search module", () => {
  it("exports searchParcelsD1", async () => {
    const mod = await import("../src/d1-search");
    expect(typeof mod.searchParcelsD1).toBe("function");
  });

  it("exports getParcelD1", async () => {
    const mod = await import("../src/d1-search");
    expect(typeof mod.getParcelD1).toBe("function");
  });

  it("exports getScreeningD1", async () => {
    const mod = await import("../src/d1-search");
    expect(typeof mod.getScreeningD1).toBe("function");
  });
});
