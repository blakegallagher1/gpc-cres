import { describe, expect, it } from "vitest";

import {
  calculateIRR,
  calculateNPV,
  calculateDSCR,
  calculateCapRate,
  calculateDebtYield,
  calculateLTV,
  calculateCashOnCash,
  calculateEquityMultiple,
  calculateMonthlyPayment,
  calculatePropertyValue,
} from "../src/scoring/finance.js";

describe("calculateNPV", () => {
  it("computes NPV for a simple cash flow series", () => {
    const npv = calculateNPV(0.1, [-1000, 300, 400, 500]);
    // -1000/(1.1^0) + 300/(1.1^1) + 400/(1.1^2) + 500/(1.1^3) = -21.04
    expect(npv).toBeCloseTo(-21.04, 0);
  });

  it("returns sum of cash flows when rate is 0", () => {
    const npv = calculateNPV(0, [-100, 50, 50, 50]);
    expect(npv).toBeCloseTo(50, 10);
  });

  it("handles empty cash flows", () => {
    expect(calculateNPV(0.1, [])).toBe(0);
  });

  it("handles single cash flow", () => {
    expect(calculateNPV(0.1, [100])).toBe(100);
  });
});

describe("calculateIRR", () => {
  it("computes IRR for a standard investment", () => {
    // -1000 initial, 400/year for 4 years => IRR ~21.9%
    const irr = calculateIRR([-1000, 400, 400, 400, 400]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.219, 2);
  });

  it("returns null for all-positive cash flows", () => {
    expect(calculateIRR([100, 200, 300])).toBeNull();
  });

  it("returns null for all-negative cash flows", () => {
    expect(calculateIRR([-100, -200, -300])).toBeNull();
  });

  it("returns null for empty cash flows", () => {
    expect(calculateIRR([])).toBeNull();
  });

  it("finds IRR that zeroes NPV", () => {
    const cashflows = [-10000, 3000, 4000, 5000, 2000];
    const irr = calculateIRR(cashflows);
    expect(irr).not.toBeNull();
    // Verify: NPV at the IRR should be ~0
    const npv = calculateNPV(irr!, cashflows);
    expect(Math.abs(npv)).toBeLessThan(0.01);
  });

  it("handles break-even investment", () => {
    // -100 then +100 => IRR = 0
    const irr = calculateIRR([-100, 100]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0, 4);
  });
});

describe("calculateDSCR", () => {
  it("computes DSCR correctly", () => {
    expect(calculateDSCR(1_000_000, 800_000)).toBeCloseTo(1.25, 4);
  });

  it("returns Infinity when debt service is 0", () => {
    expect(calculateDSCR(1_000_000, 0)).toBe(Infinity);
  });

  it("handles negative NOI", () => {
    expect(calculateDSCR(-100_000, 800_000)).toBeCloseTo(-0.125, 4);
  });
});

describe("calculateCapRate", () => {
  it("computes cap rate correctly", () => {
    expect(calculateCapRate(700_000, 10_000_000)).toBeCloseTo(0.07, 4);
  });

  it("returns 0 when value is 0", () => {
    expect(calculateCapRate(700_000, 0)).toBe(0);
  });
});

describe("calculateDebtYield", () => {
  it("computes debt yield correctly", () => {
    expect(calculateDebtYield(700_000, 7_000_000)).toBeCloseTo(0.1, 4);
  });

  it("returns 0 when loan is 0", () => {
    expect(calculateDebtYield(700_000, 0)).toBe(0);
  });
});

describe("calculateLTV", () => {
  it("computes LTV correctly", () => {
    expect(calculateLTV(6_500_000, 10_000_000)).toBeCloseTo(0.65, 4);
  });

  it("returns 0 when property value is 0", () => {
    expect(calculateLTV(6_500_000, 0)).toBe(0);
  });
});

describe("calculateCashOnCash", () => {
  it("computes cash-on-cash return", () => {
    expect(calculateCashOnCash(100_000, 1_000_000)).toBeCloseTo(0.1, 4);
  });

  it("returns 0 when equity is 0", () => {
    expect(calculateCashOnCash(100_000, 0)).toBe(0);
  });
});

describe("calculateEquityMultiple", () => {
  it("computes equity multiple", () => {
    expect(calculateEquityMultiple(2_000_000, 1_000_000)).toBeCloseTo(2.0, 4);
  });

  it("returns 0 when equity is 0", () => {
    expect(calculateEquityMultiple(2_000_000, 0)).toBe(0);
  });
});

describe("calculateMonthlyPayment", () => {
  it("computes amortizing payment", () => {
    // $1M at 6% for 30 years => ~$5,995.51/mo
    const payment = calculateMonthlyPayment(1_000_000, 0.06, 30);
    expect(payment).toBeCloseTo(5995.51, 0);
  });

  it("handles 0% interest rate", () => {
    const payment = calculateMonthlyPayment(120_000, 0, 10);
    expect(payment).toBeCloseTo(1000, 2);
  });
});

describe("calculatePropertyValue", () => {
  it("computes value from NOI and cap rate", () => {
    const value = calculatePropertyValue(700_000, 0.07);
    expect(value).toBeCloseTo(10_000_000, 0);
  });

  it("returns 0 when cap rate is 0", () => {
    expect(calculatePropertyValue(700_000, 0)).toBe(0);
  });
});
