import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    calibrationRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { evictOldCalibrationRecords } from "@/lib/services/calibrationEviction";
import { MAX_CALIBRATION_RECORDS_PER_SEGMENT } from "@/lib/services/promotionConfig";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SEGMENT_ID = "seg-001";

describe("evictOldCalibrationRecords", () => {
  beforeEach(() => {
    prismaMock.calibrationRecord.count.mockReset();
    prismaMock.calibrationRecord.findMany.mockReset();
    prismaMock.calibrationRecord.deleteMany.mockReset();
  });

  it("returns no evictions when count is within limit", async () => {
    prismaMock.calibrationRecord.count.mockResolvedValue(100);

    const result = await evictOldCalibrationRecords(ORG_ID, SEGMENT_ID);

    expect(result.evicted).toBe(0);
    expect(result.totalBefore).toBe(100);
    expect(result.totalAfter).toBe(100);
    expect(prismaMock.calibrationRecord.findMany).not.toHaveBeenCalled();
    expect(prismaMock.calibrationRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("evicts oldest records when count exceeds limit", async () => {
    const excess = 10;
    prismaMock.calibrationRecord.count.mockResolvedValue(
      MAX_CALIBRATION_RECORDS_PER_SEGMENT + excess,
    );
    prismaMock.calibrationRecord.findMany.mockResolvedValue(
      Array.from({ length: excess }, (_, i) => ({ id: `old-${i}` })),
    );
    prismaMock.calibrationRecord.deleteMany.mockResolvedValue({ count: excess });

    const result = await evictOldCalibrationRecords(ORG_ID, SEGMENT_ID);

    expect(result.evicted).toBe(excess);
    expect(result.totalBefore).toBe(MAX_CALIBRATION_RECORDS_PER_SEGMENT + excess);
    expect(result.totalAfter).toBe(MAX_CALIBRATION_RECORDS_PER_SEGMENT);

    expect(prismaMock.calibrationRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        take: excess,
      }),
    );

    expect(prismaMock.calibrationRecord.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(["old-0"]) } },
      }),
    );
  });

  it("returns correct count at exactly the limit", async () => {
    prismaMock.calibrationRecord.count.mockResolvedValue(
      MAX_CALIBRATION_RECORDS_PER_SEGMENT,
    );

    const result = await evictOldCalibrationRecords(ORG_ID, SEGMENT_ID);

    expect(result.evicted).toBe(0);
    expect(prismaMock.calibrationRecord.findMany).not.toHaveBeenCalled();
  });
});
