import { prisma } from "@entitlement-os/db";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KnowledgeContentType =
  | "deal_memo"
  | "agent_analysis"
  | "document_extraction"
  | "market_report"
  | "user_note"
  | "outcome_record"
  | "reasoning_trace";

export interface KnowledgeSearchResult {
  id: string;
  contentType: KnowledgeContentType;
  sourceId: string;
  contentText: string;
  metadata: Record<string, unknown>;
  similarity: number;
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  contentType: KnowledgeContentType;
  sourceId: string;
  contentText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Embedding client
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // Limit input to ~8K chars
  });
  return response.data[0].embedding;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500; // tokens (~2000 chars)
const CHUNK_OVERLAP = 50; // tokens (~200 chars)
const CHARS_PER_TOKEN = 4; // rough estimate

function chunkText(text: string): string[] {
  const maxChars = CHUNK_SIZE * CHARS_PER_TOKEN;
  const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;

  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));

    if (end >= text.length) break;
    start = end - overlapChars;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export async function ingestKnowledge(
  contentType: KnowledgeContentType,
  sourceId: string,
  contentText: string,
  metadata: Record<string, unknown> = {}
): Promise<string[]> {
  const chunks = chunkText(contentText);
  const ids: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk);
    const embeddingStr = `[${embedding.join(",")}]`;
    const metaJson = JSON.stringify({
      ...metadata,
      chunkIndex: i,
      totalChunks: chunks.length,
    });

    // Use raw SQL for vector insertion
    const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO knowledge_embeddings (id, content_type, source_id, content_text, embedding, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::vector(1536), $5::jsonb, NOW(), NOW())
       RETURNING id::text`,
      contentType,
      sourceId,
      chunk,
      embeddingStr,
      metaJson
    );

    if (result[0]) ids.push(result[0].id);
  }

  return ids;
}

export async function deleteKnowledge(sourceId: string): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM knowledge_embeddings WHERE source_id = $1`,
    sourceId
  );
  return result;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchKnowledgeBase(
  query: string,
  contentTypes?: KnowledgeContentType[],
  limit = 5
): Promise<KnowledgeSearchResult[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  let sql: string;
  const params: unknown[] = [embeddingStr, limit];

  if (contentTypes && contentTypes.length > 0) {
    // Build parameterized IN clause
    const placeholders = contentTypes.map((_, i) => `$${i + 3}`).join(", ");
    sql = `
      SELECT
        id::text,
        content_type AS "contentType",
        source_id AS "sourceId",
        content_text AS "contentText",
        metadata,
        1 - (embedding <=> $1::vector(1536)) AS similarity,
        created_at AS "createdAt"
      FROM knowledge_embeddings
      WHERE content_type IN (${placeholders})
      ORDER BY embedding <=> $1::vector(1536)
      LIMIT $2
    `;
    params.push(...contentTypes);
  } else {
    sql = `
      SELECT
        id::text,
        content_type AS "contentType",
        source_id AS "sourceId",
        content_text AS "contentText",
        metadata,
        1 - (embedding <=> $1::vector(1536)) AS similarity,
        created_at AS "createdAt"
      FROM knowledge_embeddings
      ORDER BY embedding <=> $1::vector(1536)
      LIMIT $2
    `;
  }

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      contentType: string;
      sourceId: string;
      contentText: string;
      metadata: Record<string, unknown>;
      similarity: number;
      createdAt: Date;
    }>
  >(sql, ...params);

  return results.map((r) => ({
    id: r.id,
    contentType: r.contentType as KnowledgeContentType,
    sourceId: r.sourceId,
    contentText: r.contentText,
    metadata: r.metadata ?? {},
    similarity: Math.round(Number(r.similarity) * 1000) / 1000,
    createdAt: r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt),
  }));
}

// ---------------------------------------------------------------------------
// Listing / Stats
// ---------------------------------------------------------------------------

export async function getKnowledgeStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const counts = await prisma.$queryRawUnsafe<
    Array<{ content_type: string; count: string }>
  >(
    `SELECT content_type, COUNT(*) as count FROM knowledge_embeddings GROUP BY content_type ORDER BY count DESC`
  );

  const total = counts.reduce((s, c) => s + Number(c.count), 0);
  const byType: Record<string, number> = {};
  for (const c of counts) {
    byType[c.content_type] = Number(c.count);
  }

  return { total, byType };
}

export async function getRecentEntries(
  limit = 20,
  contentType?: KnowledgeContentType
): Promise<KnowledgeEntry[]> {
  let sql: string;
  const params: unknown[] = [limit];

  if (contentType) {
    sql = `
      SELECT id::text, content_type AS "contentType", source_id AS "sourceId",
             content_text AS "contentText", metadata, created_at AS "createdAt"
      FROM knowledge_embeddings
      WHERE content_type = $2
      ORDER BY created_at DESC
      LIMIT $1
    `;
    params.push(contentType);
  } else {
    sql = `
      SELECT id::text, content_type AS "contentType", source_id AS "sourceId",
             content_text AS "contentText", metadata, created_at AS "createdAt"
      FROM knowledge_embeddings
      ORDER BY created_at DESC
      LIMIT $1
    `;
  }

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      contentType: string;
      sourceId: string;
      contentText: string;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>
  >(sql, ...params);

  return results.map((r) => ({
    id: r.id,
    contentType: r.contentType as KnowledgeContentType,
    sourceId: r.sourceId,
    contentText: r.contentText.slice(0, 500), // Truncate for listing
    metadata: r.metadata ?? {},
    createdAt: r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt),
  }));
}
