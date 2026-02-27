import "server-only";

import { prisma } from "@entitlement-os/db";

/**
 * Entity collision detection.
 *
 * Cron-based Levenshtein similarity check on entity addresses.
 * Alerts only — never auto-merge. Human review required.
 *
 * Similarity is computed client-side using a simple Levenshtein ratio
 * since Postgres doesn't have native Levenshtein without pg_trgm.
 */

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Compute similarity ratio between two strings (0-1).
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Normalize an address for comparison (lowercase, strip common variations).
 */
function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place)\b/g, "")
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

/**
 * Scan entities within an org for potential address collisions.
 * Returns new collision alerts that don't already exist.
 */
export async function detectCollisions(
  orgId: string,
): Promise<CollisionAlert[]> {
  const entities = await prisma.internalEntity.findMany({
    where: { orgId },
    select: { id: true, canonicalAddress: true },
    orderBy: { createdAt: "asc" },
    take: 500, // Cap to prevent quadratic blowup on large orgs
  });

  const withAddress = entities.filter(
    (e): e is typeof e & { canonicalAddress: string } => !!e.canonicalAddress,
  );

  const alerts: CollisionAlert[] = [];

  // Pairwise comparison (O(n²) but capped at 500 entities)
  for (let i = 0; i < withAddress.length; i++) {
    for (let j = i + 1; j < withAddress.length; j++) {
      const a = withAddress[i];
      const b = withAddress[j];

      const sim = similarity(
        normalizeAddress(a.canonicalAddress),
        normalizeAddress(b.canonicalAddress),
      );

      if (sim >= SIMILARITY_THRESHOLD) {
        alerts.push({
          entityIdA: a.id,
          entityIdB: b.id,
          addressA: a.canonicalAddress,
          addressB: b.canonicalAddress,
          similarity: sim,
        });
      }
    }
  }

  return alerts;
}

/**
 * Persist collision alerts, skipping those that already exist.
 */
export async function persistCollisionAlerts(
  orgId: string,
  alerts: CollisionAlert[],
): Promise<number> {
  let created = 0;

  for (const alert of alerts) {
    // Check if this pair already has a pending alert
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
      created++;
    }
  }

  return created;
}

/**
 * Get pending collision alerts for review.
 */
export async function getPendingCollisions(
  orgId: string,
  limit = 20,
): Promise<Array<{
  id: string;
  entityIdA: string;
  entityIdB: string;
  addressA: string;
  addressB: string;
  similarity: number;
  status: string;
  createdAt: Date;
}>> {
  return prisma.entityCollisionAlert.findMany({
    where: { orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Resolve a collision alert.
 */
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
