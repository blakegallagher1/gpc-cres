import { prisma } from "@entitlement-os/db";

const SIMILARITY_THRESHOLD = 0.85;

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let index = 0; index <= a.length; index += 1) {
    matrix[index] = [index];
  }
  for (let index = 0; index <= b.length; index += 1) {
    matrix[0][index] = index;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 1;
  }

  return 1 - levenshteinDistance(a, b) / maxLen;
}

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(
      /\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place)\b/g,
      "",
    )
    .replace(/[.,#\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CollisionAlert {
  entityIdA: string;
  entityIdB: string;
  addressA: string;
  addressB: string;
  similarity: number;
}

export async function detectCollisions(orgId: string): Promise<CollisionAlert[]> {
  const entities = await prisma.internalEntity.findMany({
    where: { orgId },
    select: { id: true, canonicalAddress: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const withAddress = entities.filter(
    (entity): entity is typeof entity & { canonicalAddress: string } =>
      Boolean(entity.canonicalAddress),
  );

  const alerts: CollisionAlert[] = [];

  for (let left = 0; left < withAddress.length; left += 1) {
    for (let right = left + 1; right < withAddress.length; right += 1) {
      const entityA = withAddress[left];
      const entityB = withAddress[right];

      const ratio = similarity(
        normalizeAddress(entityA.canonicalAddress),
        normalizeAddress(entityB.canonicalAddress),
      );

      if (ratio >= SIMILARITY_THRESHOLD) {
        alerts.push({
          entityIdA: entityA.id,
          entityIdB: entityB.id,
          addressA: entityA.canonicalAddress,
          addressB: entityB.canonicalAddress,
          similarity: ratio,
        });
      }
    }
  }

  return alerts;
}

export async function persistCollisionAlerts(
  orgId: string,
  alerts: CollisionAlert[],
): Promise<number> {
  let created = 0;

  for (const alert of alerts) {
    const existing = await prisma.entityCollisionAlert.findFirst({
      where: {
        orgId,
        entityIdA: alert.entityIdA,
        entityIdB: alert.entityIdB,
        status: "pending",
      },
    });

    if (!existing) {
      await prisma.entityCollisionAlert.create({
        data: {
          orgId,
          entityIdA: alert.entityIdA,
          entityIdB: alert.entityIdB,
          similarity: alert.similarity,
          addressA: alert.addressA,
          addressB: alert.addressB,
        },
      });
      created += 1;
    }
  }

  return created;
}

export async function getPendingCollisions(
  orgId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    entityIdA: string;
    entityIdB: string;
    addressA: string;
    addressB: string;
    similarity: number;
    status: string;
    createdAt: Date;
  }>
> {
  return prisma.entityCollisionAlert.findMany({
    where: { orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function resolveCollision(
  orgId: string,
  alertId: string,
  resolvedBy: string,
  resolution: "merge" | "distinct" | "ignore",
): Promise<void> {
  await prisma.entityCollisionAlert.update({
    where: { id: alertId, orgId },
    data: {
      status: "resolved",
      resolvedBy,
      resolvedAt: new Date(),
      resolution,
    },
  });
}
