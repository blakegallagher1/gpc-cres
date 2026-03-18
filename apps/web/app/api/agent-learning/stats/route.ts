import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

import { resolveAuth } from "@/lib/auth/resolveAuth";

export const dynamic = "force-dynamic";

type AverageLatencyRow = {
  avg_ms: number | string | null;
};

type ErrorCountRow = {
  error_message: string | null;
  error_count: bigint | number;
};

function normalizeAverageLatency(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeCount(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = auth;

  const [
    totalPromotedRuns,
    pendingRuns,
    failedRuns,
    trajectoryLogCount,
    episodicEntryCount,
    proceduralSkillCount,
    averageLatencyRows,
    errorRows,
  ] = await Promise.all([
    prisma.run.count({
      where: {
        orgId,
        memoryPromotionStatus: "succeeded",
      },
    }),
    prisma.run.count({
      where: {
        orgId,
        memoryPromotionStatus: {
          in: ["pending", "processing"],
        },
      },
    }),
    prisma.run.count({
      where: {
        orgId,
        memoryPromotionStatus: "failed",
      },
    }),
    prisma.trajectoryLog.count({ where: { orgId } }),
    prisma.episodicEntry.count({ where: { orgId } }),
    prisma.proceduralSkill.count({ where: { orgId } }),
    prisma.$queryRawUnsafe<AverageLatencyRow[]>(
      `SELECT AVG(EXTRACT(EPOCH FROM (memory_promoted_at - finished_at)) * 1000) AS avg_ms
       FROM runs
       WHERE org_id = $1::uuid
         AND memory_promotion_status = 'succeeded'
         AND memory_promoted_at IS NOT NULL
         AND finished_at IS NOT NULL`,
      orgId,
    ),
    prisma.$queryRawUnsafe<ErrorCountRow[]>(
      `SELECT memory_promotion_error AS error_message, COUNT(*) AS error_count
       FROM runs
       WHERE org_id = $1::uuid
         AND memory_promotion_status = 'failed'
         AND memory_promotion_error IS NOT NULL
       GROUP BY memory_promotion_error
       ORDER BY COUNT(*) DESC, memory_promotion_error ASC
       LIMIT 5`,
      orgId,
    ),
  ]);

  return NextResponse.json({
    totalPromotedRuns,
    pendingRuns,
    failedRuns,
    trajectoryLogCount,
    episodicEntryCount,
    proceduralSkillCount,
    averagePromotionLatencyMs: normalizeAverageLatency(averageLatencyRows[0]?.avg_ms),
    topMemoryPromotionErrors: errorRows.map((row) => ({
      message: row.error_message ?? "Unknown error",
      count: normalizeCount(row.error_count),
    })),
  });
}
