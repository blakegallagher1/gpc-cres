import { describe, it, expect } from "vitest";
import { getReasoningEffort } from "../reasoningEffort";

describe("reasoningEffort", () => {
  it("returns 'low' for screening", () => {
    expect(getReasoningEffort("screening")).toBe("low");
  });

  it("returns 'medium' for chat", () => {
    expect(getReasoningEffort("chat")).toBe("medium");
  });

  it("returns 'high' for deal_analysis", () => {
    expect(getReasoningEffort("deal_analysis")).toBe("high");
  });

  it("returns 'medium' for unknown run type", () => {
    expect(getReasoningEffort("unknown_type")).toBe("medium");
  });

  it("returns 'medium' for null", () => {
    expect(getReasoningEffort(null)).toBe("medium");
  });

  it("returns 'medium' for undefined", () => {
    expect(getReasoningEffort(undefined)).toBe("medium");
  });
});
