import "server-only";

import { prisma } from "@entitlement-os/db";
import { MAX_CALIBRATION_RECORDS_PER_SEGMENT } from "./promotionConfig";

/**
 * Bounded calibration memory.
 *
 * After each calibration record insert, check whether the segment has
 * exceeded MAX_CALIBRATION_RECORDS_PER_SEGMENT. If so, evict the oldest
 * records (by createdAt) to stay within the limit.
 *
 * This prevents unbounded growth while keeping the most recent (and
 * therefore most relevant) calibration data.
 */

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

  // Find the IDs of the oldest records to evict
  const toEvict = await prisma.calibrationRecord.findMany({
    where: { orgId, segmentId },
    orderBy: { createdAt: "asc" },
    take: excess,
    select: { id: true },
  });

  if (toEvict.length > 0) {
    await prisma.calibrationRecord.deleteMany({
      where: { id: { in: toEvict.map((r) => r.id) } },
    });
  }

  return {
    segmentId,
    totalBefore,
    evicted: toEvict.length,
    totalAfter: totalBefore - toEvict.length,
  };
}
