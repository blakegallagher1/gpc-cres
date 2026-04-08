import "server-only";

import { prisma } from "@entitlement-os/db";

export async function getMemoryEntityView(orgId: string, entityId: string) {
  const entity = await prisma.internalEntity.findUnique({
    where: { id: entityId },
  });

  if (!entity) {
    return { status: "not_found" as const };
  }

  if (entity.orgId !== orgId) {
    return { status: "forbidden" as const };
  }

  const [drafts, verified, collisionAlerts, eventLogs] = await Promise.all([
    prisma.memoryDraft.findMany({
      where: { entityId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.memoryVerified.findMany({
      where: { entityId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entityCollisionAlert.findMany({
      where: {
        OR: [{ entityIdA: entityId }, { entityIdB: entityId }],
        status: "pending",
      },
    }),
    prisma.memoryEventLog.findMany({
      where: { entityId },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
  ]);

  return {
    status: "ok" as const,
    entity,
    drafts,
    verified,
    collisionAlerts,
    eventLogs,
  };
}
