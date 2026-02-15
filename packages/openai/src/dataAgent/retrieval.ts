/**
 * Data Agent retrieval utility for hybrid semantic/sparse/graph retrieval.
 */

import { prisma } from "@entitlement-os/db";
import {
  recordDataAgentRetrieval,
} from "@entitlement-os/shared";
import type {
  DataAgentRetrievalContext,
  DataAgentRetrievalItem,
  DataAgentRetrievalSource,
} from "@entitlement-os/shared";

import { createEmbedding } from "../embeddings.js";

type JsonRecord = Record<string, unknown>;

const DEFAULT_RETRIEVAL_LIMIT = 20;
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

interface SemanticSearchRow {
  id: string;
  contentText: string;
  metadata: JsonRecord;
  semanticScore: number;
  sourceTimestamp: Date;
}

interface SparseSearchRow {
  id: string;
  contentText: string;
  metadata: JsonRecord;
  sparseScore: number;
  sourceTimestamp: Date;
}

interface GraphSearchRow {
  id: string;
  subjectId: string;
  predicate: string;
  objectId: string;
  confidence: number;
  sourceHash: string;
  timestamp: Date;
}

let vectorSupportCache: boolean | null = null;
let sparseSupportCache: boolean | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recencyScore(timestamp: Date): number {
  const ageHours = Math.max(0, (Date.now() - timestamp.getTime()) / 3600000);
  return clamp01(Math.exp(-ageHours / (24 * 7)));
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((value) => value.toFixed(6)).join(",")}]`;
}

function normalizeMetadata(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function computeResultScore(
  semantic: number,
  sparse: number,
  graph: number,
  confidence: number,
  recency: number,
): number {
  return clamp01(
    semantic * 0.45 +
      sparse * 0.35 +
      graph * 0.2 +
      recency * 0.15 +
      confidence * 0.08,
  );
}

function coerceSources(
  semantic: number,
  sparse: number,
  graph: number,
): DataAgentRetrievalContext["sources"] {
  return {
    semantic: Math.max(0, Math.floor(semantic)),
    sparse: Math.max(0, Math.floor(sparse)),
    graph: Math.max(0, Math.floor(graph)),
  };
}

function makeItem(
  source: DataAgentRetrievalSource,
  id: string,
  text: string,
  confidence: number,
  metadata: JsonRecord,
): DataAgentRetrievalItem {
  return {
    id,
    source,
    text,
    score: clamp01(confidence),
    metadata,
  };
}

function isRecoverableVectorError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error).toLowerCase();
  return [
    "vector",
    "pgvector",
    "operator does not exist",
    "no such function",
    "cannot cast type",
    "type vector",
    "does not exist",
  ].some((token) => message.includes(token));
}

function isRecoverableSparseError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error).toLowerCase();
  return [
    "trigram",
    "gin_trgm_ops",
    "similarity(",
    "does not exist",
    "no such operator",
    "undefined function",
    "pg_trgm",
  ].some((token) => message.includes(token));
}

async function hasVectorSupport(): Promise<boolean> {
  if (vectorSupportCache !== null) {
    return vectorSupportCache;
  }

  try {
    const availability = await prisma.$queryRawUnsafe<Array<{ available: boolean }>>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname IN ('vector', 'pgvector')
      ) AS available
      `,
    );

    vectorSupportCache = Boolean(availability?.[0]?.available);
    return vectorSupportCache;
  } catch {
    vectorSupportCache = false;
    return false;
  }
}

async function semanticSearch(
  query: string,
  subjectId?: string,
): Promise<DataAgentRetrievalItem[]> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return [];
  }
  try {
    const embedding = await createEmbedding(query, OPENAI_EMBEDDING_MODEL);
    const vector = toVectorLiteral(embedding);

    const rows = await prisma.$queryRawUnsafe<SemanticSearchRow[]>(
      `
        SELECT
          ke.id as "id",
          ke.content_text as "contentText",
          ke.metadata as "metadata",
          (1 - (ke.vector_embedding <=> $1::vector)) as "semanticScore",
          ke.updated_at as "sourceTimestamp"
        FROM "KnowledgeEmbedding" ke
        WHERE ke.vector_embedding IS NOT NULL
        ORDER BY ke.vector_embedding <=> $1::vector ASC
        LIMIT 40
      `,
      vector,
    );

    const filtered = subjectId
      ? rows.filter((row) => {
          const metadata = normalizeMetadata(row.metadata);
          return (
            row.contentText.includes(subjectId) ||
            String(metadata.subjectId ?? "") === subjectId
          );
        })
      : rows;

    return filtered.map((row) => {
      const semanticScore = clamp01(row.semanticScore);
      const recency = recencyScore(new Date(row.sourceTimestamp));
      const confidence = semanticScore * 0.8 + recency * 0.2;
      return makeItem("semantic", row.id, row.contentText, confidence, normalizeMetadata(row.metadata));
    });
  } catch (error) {
    if (isRecoverableVectorError(error)) {
      return [];
    }
    throw error;
  }
}

async function sparseSearch(
  query: string,
  subjectId?: string,
): Promise<DataAgentRetrievalItem[]> {
  if (sparseSupportCache === false) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<SparseSearchRow[]>(
      `
        SELECT
          ke.id as "id",
          ke.content_text as "contentText",
          ke.metadata as "metadata",
          similarity(ke.content_text, $1) as "sparseScore",
          ke.updated_at as "sourceTimestamp"
        FROM "KnowledgeEmbedding" ke
        WHERE ke.content_text % $1
        ORDER BY "sparseScore" DESC
        LIMIT 40
      `,
      query,
    );

    sparseSupportCache = true;

    const filtered = subjectId
      ? rows.filter((row) => {
          const metadata = normalizeMetadata(row.metadata);
          return (
            row.contentText.includes(subjectId) ||
            String(metadata.subjectId ?? "") === subjectId
          );
        })
      : rows;

    return filtered.map((row) => {
      const sparse = clamp01(row.sparseScore);
      const recency = recencyScore(new Date(row.sourceTimestamp));
      const confidence = sparse * 0.7 + recency * 0.3;
      return makeItem("sparse", row.id, row.contentText, confidence, normalizeMetadata(row.metadata));
    });
  } catch (error) {
    if (isRecoverableSparseError(error)) {
      sparseSupportCache = false;
      return [];
    }
    throw error;
  }
}

async function graphSearch(query: string, subjectId?: string): Promise<DataAgentRetrievalItem[]> {
  const params: unknown[] = [query];
  if (subjectId) {
    params.push(subjectId);
  }

  const sql = subjectId
    ? `
      SELECT
        ge.id as "id",
        ge.subject_id as "subjectId",
        ge.predicate as "predicate",
        ge.object_id as "objectId",
        ge.confidence as "confidence",
        ge.source_hash as "sourceHash",
        ge.timestamp as "timestamp"
      FROM "KGEvent" ge
      WHERE
        ge.subject_id ILIKE ('%' || $1 || '%')
        OR ge.object_id ILIKE ('%' || $1 || '%')
        OR ge.predicate ILIKE ('%' || $1 || '%')
        OR ge.subject_id = $2
      ORDER BY ge.confidence DESC, ge.timestamp DESC
      LIMIT 40
      `
    : `
      SELECT
        ge.id as "id",
        ge.subject_id as "subjectId",
        ge.predicate as "predicate",
        ge.object_id as "objectId",
        ge.confidence as "confidence",
        ge.source_hash as "sourceHash",
        ge.timestamp as "timestamp"
      FROM "KGEvent" ge
      WHERE
        ge.subject_id ILIKE ('%' || $1 || '%')
        OR ge.object_id ILIKE ('%' || $1 || '%')
        OR ge.predicate ILIKE ('%' || $1 || '%')
      ORDER BY ge.confidence DESC, ge.timestamp DESC
      LIMIT 40
      `;

  const rows = await prisma.$queryRawUnsafe<GraphSearchRow[]>(sql, ...params);

  return rows.map((row) => {
    const recency = recencyScore(new Date(row.timestamp));
    const score = clamp01(clamp01(row.confidence) * 0.75 + recency * 0.15);
    return makeItem(
      "graph",
      row.id,
      `${row.subjectId} ${row.predicate} ${row.objectId}`,
      score,
      {
        subjectId: row.subjectId,
        predicate: row.predicate,
        objectId: row.objectId,
        sourceHash: row.sourceHash,
      },
    );
  });
}

/**
 * Build a retrieval context for agent runs from hybrid memory sources.
 */
export async function buildDataAgentRetrievalContext(
  query: string,
  subjectId?: string,
): Promise<DataAgentRetrievalContext> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("query is required");
  }

  const useVector = await hasVectorSupport();
  const [semantic, sparse, graph] = await Promise.all([
    useVector ? semanticSearch(normalizedQuery, subjectId) : Promise.resolve([]),
    sparseSearch(normalizedQuery, subjectId),
    graphSearch(normalizedQuery, subjectId),
  ]);

  const sourceStats = coerceSources(semantic.length, sparse.length, graph.length);
  const merged = new Map<string, DataAgentRetrievalItem>();

  [...semantic, ...sparse, ...graph].forEach((item) => {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
      return;
    }
    existing.score = clamp01(Math.max(existing.score, item.score));
    existing.metadata = {
      ...existing.metadata,
      ...item.metadata,
      merged: true,
    };
  });

  const results = Array.from(merged.values())
    .map((item) => {
      const subjectBoost =
        subjectId &&
        ((item.metadata?.subjectId === subjectId) || item.text.includes(subjectId))
          ? 0.08
          : 0;
      const score = computeResultScore(
        item.source === "semantic" ? item.score : 0,
        item.source === "sparse" ? item.score : 0,
        item.source === "graph" ? item.score : 0,
        Math.max(0, item.score),
        0,
      );
      return { ...item, score: clamp01(score + subjectBoost) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, DEFAULT_RETRIEVAL_LIMIT)
    .map(({ id, source, text, score, metadata }) => ({
      id,
      source,
      text,
      score,
      metadata,
    }));

  recordDataAgentRetrieval({
    query: normalizedQuery,
    resultCount: results.length,
    sources: sourceStats,
    topScore: results[0]?.score ?? null,
    hasSubjectScope: Boolean(subjectId),
  });

  return {
    query: normalizedQuery,
    subjectId,
    generatedAt: nowIso(),
    results,
    sources: sourceStats,
  };
}
