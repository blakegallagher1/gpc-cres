import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    internalEntity: {
      findFirst: vi.fn(),
    },
    calibrationSegment: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { computeDynamicThreshold } from "@/lib/services/dynamicThreshold";
import { BASE_PROMOTION_THRESHOLD } from "@/lib/services/promotionConfig";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("computeDynamicThreshold", () => {
  beforeEach(() => {
    prismaMock.internalEntity.findFirst.mockReset();
    prismaMock.calibrationSegment.findFirst.mockReset();
  });

  it("returns base threshold for stable, well-calibrated segment", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 50,
      mae: 0.05,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "stable",
    });

    expect(result.baseThreshold).toBe(BASE_PROMOTION_THRESHOLD);
    expect(result.threshold).toBe(BASE_PROMOTION_THRESHOLD);
    expect(result.adjustments.volatility).toBe(0);
    expect(result.adjustments.sampleSize).toBe(0);
    expect(result.adjustments.maeDrift).toBe(0);
  });

  it("adds +0.05 for high_volatility", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 50,
      mae: 0.05,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "high_volatility",
    });

    expect(result.adjustments.volatility).toBe(0.05);
    expect(result.threshold).toBeCloseTo(BASE_PROMOTION_THRESHOLD + 0.05, 4);
  });

  it("adds +0.02 for cyclical", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 50,
      mae: 0.05,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "cyclical",
    });

    expect(result.adjustments.volatility).toBe(0.02);
  });

  it("adds +0.05 for scarce samples", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 1,
      mae: 0.05,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "stable",
    });

    expect(result.adjustments.sampleSize).toBe(0.05);
  });

  it("adds +0.05 when no segment exists", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue(null);

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "stable",
    });

    expect(result.adjustments.sampleSize).toBe(0.05);
  });

  it("adds MAE drift penalty when MAE > 0.15", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 50,
      mae: 0.30,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "stable",
    });

    expect(result.adjustments.maeDrift).toBeGreaterThan(0);
    expect(result.adjustments.maeDrift).toBeLessThanOrEqual(0.15);
  });

  it("clamps total threshold to [0.4, 0.95]", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ type: "property" });
    // Everything maxed out
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      sampleN: 1,
      mae: 0.9,
    });

    const result = await computeDynamicThreshold({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      volatilityClass: "high_volatility",
    });

    expect(result.threshold).toBeLessThanOrEqual(0.95);
    expect(result.threshold).toBeGreaterThanOrEqual(0.4);
  });
});
