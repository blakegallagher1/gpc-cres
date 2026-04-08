import { prisma } from "@entitlement-os/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KnowledgeExportRow = {
  id: string;
  content_type: string;
  source_id: string;
  content_text: string;
  created_at: Date;
};

export type MemoryExportRow = {
  id: string;
  entityId: string;
  entity: { canonicalAddress: string | null } | null;
  factType: string;
  sourceType: string;
  economicWeight: number;
  payloadJson: Record<string, unknown> | null;
  createdAt: Date;
};

export const EXPORT_ROW_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Knowledge export
// ---------------------------------------------------------------------------

export async function fetchKnowledgeExportRows(
  orgId: string,
): Promise<KnowledgeExportRow[]> {
  return prisma.$queryRawUnsafe<KnowledgeExportRow[]>(
    `SELECT id, content_type, source_id, content_text, created_at
     FROM knowledge_embeddings WHERE org_id = $1::uuid
     ORDER BY created_at DESC LIMIT $2`,
    orgId,
    EXPORT_ROW_LIMIT,
  );
}

export function formatKnowledgeCsvHeader(): string {
  return "id,content_type,source_id,content_text,created_at\n";
}

export function formatKnowledgeCsvRow(row: KnowledgeExportRow): string {
  return (
    [
      row.id,
      row.content_type,
      row.source_id,
      `"${row.content_text.replace(/"/g, '""')}"`,
      row.created_at.toISOString(),
    ].join(",") + "\n"
  );
}

// ---------------------------------------------------------------------------
// Memory export
// ---------------------------------------------------------------------------

export async function fetchMemoryExportRows(
  orgId: string,
): Promise<MemoryExportRow[]> {
  const rows = await prisma.memoryVerified.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: EXPORT_ROW_LIMIT,
    include: { entity: { select: { canonicalAddress: true } } },
  });
  return rows as unknown as MemoryExportRow[];
}

export function formatMemoryCsvHeader(): string {
  return "id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt\n";
}

export function formatMemoryCsvRow(row: MemoryExportRow): string {
  return (
    [
      row.id,
      row.entityId,
      `"${(row.entity?.canonicalAddress ?? "").replace(/"/g, '""')}"`,
      row.factType,
      row.sourceType,
      row.economicWeight,
      `"${JSON.stringify(row.payloadJson ?? {}).replace(/"/g, '""')}"`,
      row.createdAt.toISOString(),
    ].join(",") + "\n"
  );
}
