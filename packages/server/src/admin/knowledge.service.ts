import { prisma } from "@entitlement-os/db";

/**
 * Check that a knowledge row exists and belongs to the given org.
 * Returns the row id if found, null otherwise.
 */
export async function findKnowledgeRow(
  id: string,
  orgId: string,
): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM knowledge_embeddings WHERE id = $1::uuid AND org_id = $2::uuid`,
    id,
    orgId,
  );
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Delete a knowledge row scoped to the given org.
 */
export async function deleteKnowledgeRow(
  id: string,
  orgId: string,
): Promise<void> {
  await prisma.$queryRawUnsafe(
    `DELETE FROM knowledge_embeddings WHERE id = $1::uuid AND org_id = $2::uuid`,
    id,
    orgId,
  );
}
