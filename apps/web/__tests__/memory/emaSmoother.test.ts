import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeEma, hasWorsened } from "@/lib/services/emaSmoother";

describe("computeEma", () => {
  it("returns newValue when previousEma is null", () => {
    expect(computeEma(0.5, null)).toBe(0.5);
  });

  it("returns newValue when previousEma is NaN", () => {
    expect(computeEma(0.5, NaN)).toBe(0.5);
  });

  it("computes EMA with alpha=0.3", () => {
    // EMA = 0.3 * 0.8 + 0.7 * 0.5 = 0.24 + 0.35 = 0.59
    const result = computeEma(0.8, 0.5);
    expect(result).toBeCloseTo(0.59, 4);
  });

  it("converges toward newValue over successive calls", () => {
    let ema = 0.0;
    for (let i = 0; i < 20; i++) {
      ema = computeEma(1.0, ema);
    }
    expect(ema).toBeCloseTo(1.0, 1);
  });
});

describe("hasWorsened", () => {
  it("returns false when previousMae is null", () => {
    expect(hasWorsened(0.5, null)).toBe(false);
  });

  it("returns false when previousMae is NaN", () => {
    expect(hasWorsened(0.5, NaN)).toBe(false);
  });

  it("returns true when newMae > previousMae", () => {
    expect(hasWorsened(0.6, 0.5)).toBe(true);
  });

  it("returns false when newMae <= previousMae", () => {
    expect(hasWorsened(0.4, 0.5)).toBe(false);
    expect(hasWorsened(0.5, 0.5)).toBe(false);
  });
});
