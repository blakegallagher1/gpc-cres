import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    calibrationSegment: {
      findFirst: vi.fn(),
    },
    calibrationRecord: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { getCalibrationDelta } from "@/lib/services/calibrationService";
import { CALIBRATION_MINIMUMS } from "@/lib/services/calibrationConfig";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

const BASE_SEGMENT = {
  orgId: ORG_ID,
  propertyType: "industrial",
  market: "Baton Rouge",
  strategy: "default",
  leverageBand: "default",
  vintageYear: 2026,
} as const;

describe("calibrationService.getCalibrationDelta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when sampleN < MIN_N", async () => {
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      id: "seg-1",
      sampleN: CALIBRATION_MINIMUMS.MIN_N - 1,
      variance: 0.1,
    });

    const result = await getCalibrationDelta(ORG_ID, BASE_SEGMENT);

    expect(result).toBeNull();
    expect(prismaMock.calibrationSegment.findFirst).toHaveBeenCalledWith({
      where: {
        orgId: ORG_ID,
        propertyType: BASE_SEGMENT.propertyType,
        market: BASE_SEGMENT.market,
        strategy: BASE_SEGMENT.strategy,
        leverageBand: BASE_SEGMENT.leverageBand,
        vintageYear: BASE_SEGMENT.vintageYear,
      },
      select: { id: true, sampleN: true, variance: true },
    });
    expect(prismaMock.calibrationRecord.findMany).not.toHaveBeenCalled();
  });

  it("returns deltas when sampleN >= MIN_N and scopes by orgId", async () => {
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      id: "seg-1",
      sampleN: CALIBRATION_MINIMUMS.MIN_N + 1,
      variance: 0.1,
    });
    prismaMock.calibrationRecord.findMany.mockResolvedValue([
      {
        metricKey: "noi",
        delta: 10,
        effectiveWeight: 1,
        volatilityClass: "stable",
        createdAt: new Date(),
      },
      {
        metricKey: "noi",
        delta: 30,
        effectiveWeight: 1,
        volatilityClass: "stable",
        createdAt: new Date(),
      },
      {
        metricKey: "exit_cap",
        delta: -0.5,
        effectiveWeight: 1,
        volatilityClass: "high_volatility",
        createdAt: new Date(),
      },
    ]);

    const result = await getCalibrationDelta(ORG_ID, BASE_SEGMENT);

    expect(result).not.toBeNull();

    const noi = result?.find((d) => d.metricKey === "noi");
    expect(noi?.bias).toBeCloseTo(20, 6);
    expect(noi?.sampleN).toBe(CALIBRATION_MINIMUMS.MIN_N + 1);
    expect(noi?.confidence).toBeCloseTo(0.84, 6);

    expect(prismaMock.calibrationRecord.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, segmentId: "seg-1" },
      select: {
        metricKey: true,
        delta: true,
        effectiveWeight: true,
        volatilityClass: true,
        createdAt: true,
      },
    });
  });
});
