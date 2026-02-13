import { describe, expect, it } from "vitest";

import {
  DealOutcomeCreateInputSchema,
  DealOutcomePatchInputSchema,
  DealOutcomeSchema,
  DealOutcomeResponseSchema,
} from "../src/schemas/dealOutcome.js";

describe("DealOutcomeCreateInputSchema", () => {
  it("accepts a valid create payload", () => {
    const input = {
      dealId: "11111111-1111-4111-8111-111111111111",
      actualPurchasePrice: 500000,
      actualIrr: 0.145,
      notes: "Closing assumptions loaded",
    };

    const result = DealOutcomeCreateInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects create payload with invalid UUID and no fields", () => {
    const input = {
      dealId: "not-a-uuid",
    };

    const result = DealOutcomeCreateInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("dealId");
  });
});

describe("DealOutcomePatchInputSchema", () => {
  it("accepts valid partial patch payload", () => {
    const input = {
      actualEquityMultiple: 1.25,
      killWasCorrect: true,
    };

    const result = DealOutcomePatchInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects patch payload with no updatable fields", () => {
    const result = DealOutcomePatchInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("DealOutcomeSchema", () => {
  it("accepts outcome payload", () => {
    const input = {
      id: "11111111-1111-4111-8111-111111111111",
      dealId: "22222222-2222-4222-8222-222222222222",
      dealName: "Blue lot",
      actualPurchasePrice: 500000,
      actualNoiYear1: null,
      actualExitPrice: 950000,
      actualIrr: 0.17,
      actualEquityMultiple: 1.4,
      actualHoldPeriodMonths: 36,
      exitDate: "2025-01-01",
      exitType: "sale",
      killReason: null,
      killWasCorrect: null,
      notes: "tracked",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const result = DealOutcomeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid deal outcome payload", () => {
    const input = {
      id: "not-a-uuid",
      dealName: "",
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const result = DealOutcomeSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});

describe("DealOutcomeResponseSchema", () => {
  it("accepts outcome response payload", () => {
    const input = {
      outcome: {
        id: "11111111-1111-4111-8111-111111111111",
        dealId: "22222222-2222-4222-8222-222222222222",
        dealName: "Blue lot",
        actualPurchasePrice: 500000,
        actualNoiYear1: null,
        actualExitPrice: 950000,
        actualIrr: 0.17,
        actualEquityMultiple: 1.4,
        actualHoldPeriodMonths: 36,
        exitDate: "2025-01-01",
        exitType: "sale",
        killReason: null,
        killWasCorrect: null,
        notes: "tracked",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    };

    const result = DealOutcomeResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
