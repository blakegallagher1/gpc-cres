import "server-only";

import { prisma } from "@entitlement-os/db";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getMemoryStats(orgId: string) {
  const [
    entitiesCount,
    verifiedCount,
    draftsCount,
    collisionsCount,
    innovationCount,
    recentEvents,
  ] = await Promise.all([
    prisma.internalEntity.count({ where: { orgId, type: "property" } }),
    prisma.memoryVerified.count({ where: { orgId } }),
    prisma.memoryDraft.count({ where: { orgId } }),
    prisma.entityCollisionAlert.count({ where: { orgId, status: "pending" } }),
    prisma.innovationQueue.count({ where: { orgId, status: "pending" } }),
    prisma.memoryEventLog.count({
      where: {
        orgId,
        timestamp: {
          gte: new Date(Date.now() - SEVEN_DAYS_MS),
        },
      },
    }),
  ]);

  const factTypeBreakdown = await prisma.memoryVerified.groupBy({
    by: ["factType"],
    where: { orgId },
    _count: true,
  });

  return {
    totalEntities: entitiesCount,
    totalVerifiedFacts: verifiedCount,
    totalDraftFacts: draftsCount,
    pendingCollisions: collisionsCount,
    pendingInnovations: innovationCount,
    eventsLast7Days: recentEvents,
    factTypeBreakdown: factTypeBreakdown.map((item) => ({
      factType: item.factType,
      count: item._count,
    })),
  };
}
