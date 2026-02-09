import type { PrismaClient } from "@entitlement-os/db";

export type CompareResult = {
  changed: boolean;
  previousHash: string | null;
  previousSnapshotId: string | null;
};

/**
 * Compare a content hash against the most recent stored snapshot for a given source.
 * Returns whether the content has changed since the last capture.
 */
export async function compareEvidenceHash(params: {
  prisma: PrismaClient;
  sourceId: string;
  currentHash: string;
}): Promise<CompareResult> {
  const latest = await params.prisma.evidenceSnapshot.findFirst({
    where: { evidenceSourceId: params.sourceId },
    orderBy: { retrievedAt: "desc" },
    select: { id: true, contentHash: true },
  });

  if (!latest) {
    return { changed: true, previousHash: null, previousSnapshotId: null };
  }

  return {
    changed: latest.contentHash !== params.currentHash,
    previousHash: latest.contentHash,
    previousSnapshotId: latest.id,
  };
}
