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

export type KnowledgeSearchMode = "exact" | "semantic" | "auto";

export interface KnowledgeEntry {
  id: string;
  contentType: KnowledgeContentType;
  sourceId: string;
  contentText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

class KnowledgeSearchError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "KnowledgeSearchError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Embedding client
// ---------------------------------------------------------------------------

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: text.slice(0, 8000), // Limit input to ~8K chars
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

function getQdrantConfig() {
  const url = process.env.QDRANT_URL?.trim();
  return {
    url,
    apiKey: process.env.QDRANT_API_KEY?.trim() || null,
    collection:
      process.env.AGENTOS_QDRANT_COLLECTION_INSTITUTIONAL_KNOWLEDGE?.trim() ||
      "institutional_knowledge",
    denseVectorName:
      process.env.AGENTOS_QDRANT_DENSE_VECTOR_NAME?.trim() || "dense",
  };
}

function getQdrantHeaders(apiKey: string | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "api-key": apiKey } : {}),
  };
}

const INSTITUTIONAL_KNOWLEDGE_KEYWORD_INDEXES = [
  "orgId",
  "contentType",
  "sourceType",
  "agentName",
  "sourceId",
  "tags",
] as const;

type QdrantConfig = ReturnType<typeof getQdrantConfig>;

export interface InstitutionalKnowledgeCollectionReady {
  enabled: true;
  collection: string;
  denseVectorName: string;
}

let ensureInstitutionalKnowledgeCollectionPromise: Promise<void> | null = null;

async function ensureInstitutionalKnowledgeCollectionExists(
  config: QdrantConfig = getQdrantConfig()
): Promise<void> {
  if (!config.url) {
    return;
  }

  if (ensureInstitutionalKnowledgeCollectionPromise) {
    return ensureInstitutionalKnowledgeCollectionPromise;
  }

  const promise = (async () => {
    const headers = getQdrantHeaders(config.apiKey);
    const collectionPath = `${config.url}/collections/${encodeURIComponent(config.collection)}`;

    const checkResponse = await fetch(collectionPath, { headers });
    if (checkResponse.ok) {
      return;
    }

    if (checkResponse.status !== 404) {
      const body = await checkResponse.text().catch(() => "");
      throw new Error(
        `Failed to inspect Qdrant collection '${config.collection}': ${checkResponse.status} ${body}`.trim()
      );
    }

    const createResponse = await fetch(collectionPath, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        vectors: {
          [config.denseVectorName]: {
            size: KNOWLEDGE_EMBEDDING_DIMENSIONS,
            distance: "Cosine",
          },
        },
        sparse_vectors: {
          bm25: {
            index: {
              on_disk: false,
            },
          },
        },
        optimizers_config: {
          default_segment_number: 4,
        },
      }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text().catch(() => "");
      throw new Error(
        `Failed to create Qdrant collection '${config.collection}': ${createResponse.status} ${body}`.trim()
      );
    }

    for (const field of INSTITUTIONAL_KNOWLEDGE_KEYWORD_INDEXES) {
      const indexResponse = await fetch(`${collectionPath}/index`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          field_name: field,
          field_schema: "keyword",
        }),
      });

      if (!indexResponse.ok && indexResponse.status !== 409) {
        const body = await indexResponse.text().catch(() => "");
        throw new Error(
          `Failed to create payload index '${field}' for Qdrant collection '${config.collection}': ${indexResponse.status} ${body}`.trim()
        );
      }
    }
  })();

  ensureInstitutionalKnowledgeCollectionPromise = promise.catch((error) => {
    ensureInstitutionalKnowledgeCollectionPromise = null;
    throw error;
  });

  return ensureInstitutionalKnowledgeCollectionPromise;
}

export async function ensureInstitutionalKnowledgeCollectionReady(): Promise<InstitutionalKnowledgeCollectionReady> {
  const config = getQdrantConfig();
  if (!config.url) {
    throw new KnowledgeSearchError(
      "Institutional knowledge ingest requires Qdrant to be configured",
      503
    );
  }

  await ensureInstitutionalKnowledgeCollectionExists(config);

  return {
    enabled: true,
    collection: config.collection,
    denseVectorName: config.denseVectorName,
  };
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function classifyAutoSearchMode(query: string): Exclude<KnowledgeSearchMode, "auto"> {
  const normalized = query.trim();
  if (!normalized) {
    return "exact";
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const looksQuoted = /^".+"$/.test(normalized) || /^'.+'$/.test(normalized);
  const looksFieldScoped = /^(source|id|type):/i.test(normalized);
  const looksIdentifier =
    isUuidLike(normalized) || /^[A-Z0-9_-]{6,}$/i.test(normalized.replace(/\s+/g, ""));
  const isShortPhrase = tokens.length <= 3 && normalized.length <= 40;

  if (looksQuoted || looksFieldScoped || looksIdentifier || isShortPhrase) {
    return "exact";
  }

  return "semantic";
}

export function resolveKnowledgeSearchMode(
  query: string,
  requestedMode: KnowledgeSearchMode = "auto"
): Exclude<KnowledgeSearchMode, "auto"> {
  if (requestedMode === "auto") {
    return classifyAutoSearchMode(query);
  }

  return requestedMode;
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

async function upsertKnowledgeChunksToQdrant(
  orgId: string,
  entries: Array<{
    id: string;
    contentType: KnowledgeContentType;
    sourceId: string;
    contentText: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>
): Promise<void> {
  const config = getQdrantConfig();
  if (!config.url || entries.length === 0) {
    return;
  }

  await ensureInstitutionalKnowledgeCollectionExists(config);

  const points = await Promise.all(
    entries.map(async (entry) => ({
      id: entry.id,
      vector: {
        [config.denseVectorName]: await generateEmbedding(entry.contentText),
      },
      payload: {
        orgId,
        knowledgeId: entry.id,
        contentType: entry.contentType,
        sourceId: entry.sourceId,
        contentText: entry.contentText,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      },
    }))
  );

  const response = await fetch(
    `${config.url}/collections/${encodeURIComponent(config.collection)}/points`,
    {
      method: "PUT",
      headers: getQdrantHeaders(config.apiKey),
      body: JSON.stringify({ points, wait: true }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new KnowledgeSearchError(
      `Failed to mirror knowledge into Qdrant: ${response.status} ${body}`.trim(),
      502
    );
  }
}

async function deleteKnowledgeFromQdrant(orgId: string, sourceId: string): Promise<void> {
  const config = getQdrantConfig();
  if (!config.url) {
    return;
  }

  const response = await fetch(
    `${config.url}/collections/${encodeURIComponent(config.collection)}/points/delete`,
    {
      method: "POST",
      headers: getQdrantHeaders(config.apiKey),
      body: JSON.stringify({
        wait: true,
        filter: {
          must: [
            { key: "orgId", match: { value: orgId } },
            { key: "sourceId", match: { value: sourceId } },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new KnowledgeSearchError(
      `Failed to delete mirrored knowledge from Qdrant: ${response.status} ${body}`.trim(),
      502
    );
  }
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export async function ingestKnowledge(
  orgId: string,
  contentType: KnowledgeContentType,
  sourceId: string,
  contentText: string,
  metadata: Record<string, unknown> = {}
): Promise<string[]> {
  const chunks = chunkText(contentText);
  const ids: string[] = [];
  const qdrantEntries: Array<{
    id: string;
    contentType: KnowledgeContentType;
    sourceId: string;
    contentText: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }> = [];

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
      `INSERT INTO knowledge_embeddings (id, org_id, content_type, source_id, content_text, embedding, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5::vector(1536), $6::jsonb, NOW(), NOW())
       RETURNING id::text`,
      orgId,
      contentType,
      sourceId,
      chunk,
      embeddingStr,
      metaJson
    );

    if (result[0]) {
      ids.push(result[0].id);
      qdrantEntries.push({
        id: result[0].id,
        contentType,
        sourceId,
        contentText: chunk,
        metadata: JSON.parse(metaJson) as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });
    }
  }

  await upsertKnowledgeChunksToQdrant(orgId, qdrantEntries);

  return ids;
}

export async function deleteKnowledge(orgId: string, sourceId: string): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM knowledge_embeddings WHERE org_id = $1::uuid AND source_id = $2`,
    orgId,
    sourceId
  );

  await deleteKnowledgeFromQdrant(orgId, sourceId);

  return result;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

async function searchKnowledgeExact(
  orgId: string,
  query: string,
  contentTypes?: KnowledgeContentType[],
  limit = 5
): Promise<KnowledgeSearchResult[]> {
  const normalized = query.trim();
  const params: unknown[] = [orgId];
  const where: string[] = [`org_id = $1::uuid`];
  let nextParam = 2;

  if (contentTypes && contentTypes.length > 0) {
    const placeholders = contentTypes.map(() => `$${nextParam++}`);
    where.push(`content_type IN (${placeholders.join(", ")})`);
    params.push(...contentTypes);
  }

  if (normalized) {
    const terms = normalized
      .replace(/^["']|["']$/g, "")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 8);

    for (const term of terms) {
      const pattern = `%${term}%`;
      const placeholder = `$${nextParam++}`;
      where.push(
        `(source_id ILIKE ${placeholder} OR content_text ILIKE ${placeholder} OR CAST(metadata AS text) ILIKE ${placeholder})`
      );
      params.push(pattern);
    }
  }

  const sql = `
    SELECT
      id::text,
      content_type AS "contentType",
      source_id AS "sourceId",
      content_text AS "contentText",
      metadata,
      CASE
        WHEN source_id ILIKE $${nextParam} THEN 1
        ELSE 0.9
      END AS similarity,
      created_at AS "createdAt"
    FROM knowledge_embeddings
    WHERE ${where.join(" AND ")}
    ORDER BY similarity DESC, created_at DESC
    LIMIT $${nextParam + 1}
  `;
  params.push(normalized, limit);

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

async function searchKnowledgeSemantic(
  orgId: string,
  query: string,
  contentTypes?: KnowledgeContentType[],
  limit = 5
): Promise<KnowledgeSearchResult[]> {
  const config = getQdrantConfig();
  if (!config.url) {
    throw new KnowledgeSearchError(
      "Semantic knowledge search is unavailable because Qdrant is not configured",
      503
    );
  }

  const embedding = await generateEmbedding(query);
  const requestedLimit = contentTypes && contentTypes.length > 0 ? Math.max(limit * 3, 15) : limit;

  const response = await fetch(
    `${config.url}/collections/${encodeURIComponent(config.collection)}/points/query`,
    {
      method: "POST",
      headers: getQdrantHeaders(config.apiKey),
      body: JSON.stringify({
        query: embedding,
        using: config.denseVectorName,
        limit: requestedLimit,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [{ key: "orgId", match: { value: orgId } }],
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new KnowledgeSearchError(
      `Semantic knowledge search failed: ${response.status} ${body}`.trim(),
      503
    );
  }

  const parsed = (await response.json()) as {
    result?: { points?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  };
  const points = Array.isArray(parsed.result)
    ? parsed.result
    : parsed.result?.points ?? [];

  const filteredPoints = points.filter((point) => {
    if (!contentTypes || contentTypes.length === 0) {
      return true;
    }

    const payload =
      point.payload && typeof point.payload === "object"
        ? (point.payload as Record<string, unknown>)
        : {};
    return contentTypes.includes(
      String(payload.contentType ?? "user_note") as KnowledgeContentType
    );
  });

  return filteredPoints.slice(0, limit).map((point) => {
    const payload =
      point.payload && typeof point.payload === "object"
        ? (point.payload as Record<string, unknown>)
        : {};
    const metadata =
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : {};

    return {
      id:
        typeof payload.knowledgeId === "string"
          ? payload.knowledgeId
          : typeof point.id === "string"
            ? point.id
            : String(point.id ?? ""),
      contentType: String(payload.contentType ?? "user_note") as KnowledgeContentType,
      sourceId: String(payload.sourceId ?? ""),
      contentText: String(payload.contentText ?? ""),
      metadata,
      similarity:
        typeof point.score === "number" ? Math.round(point.score * 1000) / 1000 : 0,
      createdAt: String(payload.createdAt ?? new Date(0).toISOString()),
    };
  });
}

export async function searchKnowledgeBase(
  orgId: string,
  query: string,
  contentTypes?: KnowledgeContentType[],
  limit = 5,
  mode: KnowledgeSearchMode = "auto"
): Promise<KnowledgeSearchResult[]> {
  const resolvedMode = resolveKnowledgeSearchMode(query, mode);
  if (resolvedMode === "exact") {
    return searchKnowledgeExact(orgId, query, contentTypes, limit);
  }

  return searchKnowledgeSemantic(orgId, query, contentTypes, limit);
}

export function isKnowledgeSearchError(error: unknown): error is KnowledgeSearchError {
  return error instanceof KnowledgeSearchError;
}

// Test-only helper to reset memoized Qdrant collection checks between specs.
export function __resetKnowledgeBaseTestState(): void {
  ensureInstitutionalKnowledgeCollectionPromise = null;
}

// ---------------------------------------------------------------------------
// Listing / Stats
// ---------------------------------------------------------------------------

export async function getKnowledgeStats(orgId: string): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const counts = await prisma.$queryRawUnsafe<
    Array<{ content_type: string; count: string }>
  >(
    `SELECT content_type, COUNT(*) as count FROM knowledge_embeddings WHERE org_id = $1::uuid GROUP BY content_type ORDER BY count DESC`,
    orgId
  );

  const total = counts.reduce((s, c) => s + Number(c.count), 0);
  const byType: Record<string, number> = {};
  for (const c of counts) {
    byType[c.content_type] = Number(c.count);
  }

  return { total, byType };
}

export async function getRecentEntries(
  orgId: string,
  limit = 20,
  contentType?: KnowledgeContentType
): Promise<KnowledgeEntry[]> {
  let sql: string;
  const params: unknown[] = [orgId, limit];

  if (contentType) {
    sql = `
      SELECT id::text, content_type AS "contentType", source_id AS "sourceId",
             content_text AS "contentText", metadata, created_at AS "createdAt"
      FROM knowledge_embeddings
      WHERE org_id = $1::uuid AND content_type = $3
      ORDER BY created_at DESC
      LIMIT $2
    `;
    params.push(contentType);
  } else {
    sql = `
      SELECT id::text, content_type AS "contentType", source_id AS "sourceId",
             content_text AS "contentText", metadata, created_at AS "createdAt"
      FROM knowledge_embeddings
      WHERE org_id = $1::uuid
      ORDER BY created_at DESC
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
