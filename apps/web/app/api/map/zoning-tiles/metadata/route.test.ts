import { describe, expect, it } from "vitest";

describe("GET /api/map/zoning-tiles/metadata route export", () => {
  it("exports GET handler", async () => {
    const mod = await import("./route");
    expect(typeof mod.GET).toBe("function");
  });
});
