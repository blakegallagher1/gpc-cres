import { prisma } from "@entitlement-os/db";

const MAX_CALIBRATION_RECORDS_PER_SEGMENT = 200;

export interface EvictionResult {
  segmentId: string;
  totalBefore: number;
  evicted: number;
  totalAfter: number;
}

export async function evictOldCalibrationRecords(
  orgId: string,
  segmentId: string,
): Promise<EvictionResult> {
  const totalBefore = await prisma.calibrationRecord.count({
    where: { orgId, segmentId },
  });

  if (totalBefore <= MAX_CALIBRATION_RECORDS_PER_SEGMENT) {
    return { segmentId, totalBefore, evicted: 0, totalAfter: totalBefore };
  }

  const excess = totalBefore - MAX_CALIBRATION_RECORDS_PER_SEGMENT;
  const toEvict = await prisma.calibrationRecord.findMany({
    where: { orgId, segmentId },
    orderBy: { createdAt: "asc" },
    take: excess,
    select: { id: true },
  });

  if (toEvict.length > 0) {
    await prisma.calibrationRecord.deleteMany({
      where: { id: { in: toEvict.map((record) => record.id) } },
    });
  }

  return {
    segmentId,
    totalBefore,
    evicted: toEvict.length,
    totalAfter: totalBefore - toEvict.length,
  };
}
