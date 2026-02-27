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

describe("bandWidening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies BAND_WIDENING_PENALTY when variance exceeds ceiling", async () => {
    prismaMock.calibrationSegment.findFirst.mockResolvedValue({
      id: "seg-1",
      sampleN: CALIBRATION_MINIMUMS.MIN_N * 2,
      variance: CALIBRATION_MINIMUMS.VARIANCE_CEILING + 0.05,
    });
    prismaMock.calibrationRecord.findMany.mockResolvedValue([
      {
        metricKey: "noi",
        delta: 0.1,
        effectiveWeight: 1,
        volatilityClass: "stable",
        createdAt: new Date(),
      },
    ]);

    const result = await getCalibrationDelta(ORG_ID, {
      orgId: ORG_ID,
      propertyType: "industrial",
      market: "Baton Rouge",
      strategy: "default",
      leverageBand: "default",
      vintageYear: 2026,
    });

    expect(result).not.toBeNull();
    expect(result?.[0]?.confidence).toBeCloseTo(0.85, 6);
  });
});

