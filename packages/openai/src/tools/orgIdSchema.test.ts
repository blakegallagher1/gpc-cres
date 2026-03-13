import { describe, expect, it } from "vitest";

import { SENTINEL_ORG_ID, ToolOrgIdSchema } from "./orgIdSchema.js";

describe("ToolOrgIdSchema", () => {
  it("accepts standard UUID org IDs", () => {
    expect(
      ToolOrgIdSchema.parse("11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts the seeded sentinel org ID used by production auth", () => {
    expect(ToolOrgIdSchema.parse(SENTINEL_ORG_ID)).toBe(SENTINEL_ORG_ID);
  });

  it("rejects arbitrary non-UUID org IDs", () => {
    expect(() => ToolOrgIdSchema.parse("dev-org")).toThrow();
  });
});
