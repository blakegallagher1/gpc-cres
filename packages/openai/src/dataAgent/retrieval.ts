/**
 * Data Agent retrieval utility for exact-first orchestration.
 *
 * Exact and graph retrieval stay on authoritative Postgres records.
 * Qdrant augments only when the query looks semantic/fuzzy or exact recall is weak.
 */

import { getDataAgentSchemaCapabilities, prisma } from "@entitlement-os/db";
import { recordDataAgentRetrieval } from "@entitlement-os/shared";
import type {
  DataAgentRetrievalContext,
  DataAgentRetrievalItem,
  DataAgentRetrievalSource,
} from "@entitlement-os/shared";

import { canUseQdrantHybridRetrieval, hybridSearchQdrant } from "../agentos/qdrant.js";

type JsonRecord = Record<string, unknown>;

type ExactSearchRow = {
  id: string;
  contentText: string;
  metadata: JsonRecord;
  sourceTimestamp: Date;
};

type GraphSearchRow = {
  id: string;
  subjectId: string;
  predicate: string;
  objectId: string;
  confidence: number;
  sourceHash: string;
  timestamp: Date;
};

type RankedCandidate = {
  id: string;
  source: DataAgentRetrievalSource;
  text: string;
  metadata: JsonRecord;
  semanticScore: number;
  sparseScore: number;
  graphScore: number;
  confidence: number;
  recency: number;
  mergedSources: Set<DataAgentRetrievalSource>;
};

export type DataAgentRetrievalOptions = {
  orgId?: string;
};

const DEFAULT_RETRIEVAL_LIMIT = 20;
const MAX_RAW_RESULTS = 40;
const SOURCE_PRIORITY: Record<DataAgentRetrievalSource, number> = {
  graph: 3,
  sparse: 2,
  semantic: 1,
};
const FUZZY_QUERY_RE =
  /\b(similar|related|pattern|patterns|trend|trends|theme|themes|risk|risks|why|explain|summar(?:y|ize)|compare|anal(?:og|ogy)|fuzzy|semantic|memory|intelligence|like this|nearest|adjacent|neighbors?)\b/i;
const PRECISE_QUERY_RE =
  /\b(apn|parcel|address|owner|zoning|wetlands|flood|soils|permit|title|survey|deal|run|entity|lookup|find|show|what is|status)\b/i;
const IDENTIFIER_RE = /\b([a-z]{1,6}-\d{1,6}|\d{3,}|[a-f0-9]{8}-[a-f0-9-]{27})\b/i;

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recencyScore(timestamp: Date): number {
  const ageHours = Math.max(0, (Date.now() - timestamp.getTime()) / 3_600_000);
  return clamp01(Math.exp(-ageHours / (24 * 7)));
}

function normalizeMetadata(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function tokenizeQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  ).slice(0, 8);
}

function buildLikePatterns(query: string): string[] {
  const patterns = new Set<string>();
  const trimmed = query.trim();
  if (trimmed) {
    patterns.add(`%${trimmed}%`);
  }
  for (const token of tokenizeQuery(query)) {
    patterns.add(`%${token}%`);
  }
  return Array.from(patterns);
}

function metadataString(metadata: JsonRecord): string {
  try {
    return JSON.stringify(metadata).toLowerCase();
  } catch {
    return "";
  }
}

function isPreciseQuery(query: string): boolean {
  const tokenCount = tokenizeQuery(query).length;
  return (
    IDENTIFIER_RE.test(query) ||
    PRECISE_QUERY_RE.test(query) ||
    tokenCount <= 6 ||
    /^["'].+["']$/.test(query.trim())
  );
}

function shouldUseSemanticAugmentation(params: {
  query: string;
  exactResults: DataAgentRetrievalItem[];
}): boolean {
  const { query, exactResults } = params;
  if (FUZZY_QUERY_RE.test(query)) {
    return true;
  }
  if (!isPreciseQuery(query)) {
    return true;
  }
  if (exactResults.length === 0) {
    return true;
  }
  return (exactResults[0]?.score ?? 0) < 0.82 && tokenizeQuery(query).length >= 4;
}

function preferredSource(
  left: DataAgentRetrievalSource,
  right: DataAgentRetrievalSource,
): DataAgentRetrievalSource {
  return SOURCE_PRIORITY[left] >= SOURCE_PRIORITY[right] ? left : right;
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

function computeFinalScore(candidate: RankedCandidate, preciseQuery: boolean): number {
  const exactBoost = preciseQuery && candidate.sparseScore > 0 ? 0.08 : 0;
  const graphBoost = candidate.graphScore > 0 ? 0.04 : 0;
  return clamp01(
    candidate.semanticScore * 0.28 +
      candidate.sparseScore * 0.42 +
      candidate.graphScore * 0.22 +
      candidate.recency * 0.08 +
      candidate.confidence * 0.05 +
      exactBoost +
      graphBoost,
  );
}

async function exactSearch(
  query: string,
  subjectId: string | undefined,
  orgId: string | undefined,
): Promise<DataAgentRetrievalItem[]> {
  if (!orgId) {
    return [];
  }

  const likePatterns = buildLikePatterns(query);
  if (likePatterns.length === 0) {
    return [];
  }

  const params: unknown[] = [orgId, likePatterns];
  const subjectConstraint = subjectId
    ? (() => {
        params.push(subjectId);
        const subjectIndex = params.length;
        return `
          AND (
            ke.content_text ILIKE ('%' || $${subjectIndex} || '%')
            OR COALESCE(ke.metadata->>'subjectId', '') = $${subjectIndex}
            OR COALESCE(ke.metadata->>'runId', '') = $${subjectIndex}
          )
        `;
      })()
    : "";

  const rows = await prisma.$queryRawUnsafe<ExactSearchRow[]>(
    `
      SELECT
        ke.id as "id",
        ke.content_text as "contentText",
        ke.metadata as "metadata",
        ke.updated_at as "sourceTimestamp"
      FROM knowledge_embeddings ke
      WHERE ke.org_id = $1::uuid
        AND (
          ke.content_text ILIKE ANY($2::text[])
          OR CAST(ke.metadata AS text) ILIKE ANY($2::text[])
        )
        ${subjectConstraint}
      ORDER BY ke.updated_at DESC, ke.id ASC
      LIMIT 80
    `,
    ...params,
  );

  const lowerQuery = query.trim().toLowerCase();
  const terms = tokenizeQuery(query);

  return rows
    .map((row) => {
      const metadata = normalizeMetadata(row.metadata);
      const metadataText = metadataString(metadata);
      const lowerText = row.contentText.toLowerCase();
      const matchedTerms = terms.filter(
        (term) => lowerText.includes(term) || metadataText.includes(term),
      );
      const termCoverage = terms.length > 0 ? matchedTerms.length / terms.length : 0;
      const exactTextScore =
        lowerText === lowerQuery
          ? 1
          : lowerText.startsWith(lowerQuery)
            ? 0.96
            : lowerText.includes(lowerQuery)
              ? 0.91
              : metadataText.includes(lowerQuery)
                ? 0.84
                : 0.55 + termCoverage * 0.25;
      const subjectBoost =
        subjectId &&
        (String(metadata.subjectId ?? "") === subjectId ||
          String(metadata.runId ?? "") === subjectId ||
          lowerText.includes(subjectId.toLowerCase()))
          ? 0.08
          : 0;
      const recency = recencyScore(new Date(row.sourceTimestamp));
      const confidence = clamp01(exactTextScore * 0.82 + recency * 0.1 + subjectBoost);

      return makeItem("sparse", row.id, row.contentText, confidence, {
        ...metadata,
        retrieval: {
          mode: "postgres-exact",
          exactScore: clamp01(exactTextScore),
          matchedTerms,
          recencyScore: recency,
        },
      });
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, MAX_RAW_RESULTS);
}

async function graphSearch(
  query: string,
  subjectId: string | undefined,
  orgId: string | undefined,
): Promise<DataAgentRetrievalItem[]> {
  if (!orgId) {
    return [];
  }

  const capabilities = await getDataAgentSchemaCapabilities();
  if (!capabilities.kgEvent) {
    return [];
  }

  const params: unknown[] = [query, orgId];
  const baseWhere = subjectId
    ? `
      WHERE ge.org_id = $2::uuid
        AND (
          ge.subject_id ILIKE ('%' || $1 || '%')
          OR ge.object_id ILIKE ('%' || $1 || '%')
          OR ge.predicate ILIKE ('%' || $1 || '%')
          OR ge.subject_id = $3
        )
    `
    : `
      WHERE ge.org_id = $2::uuid
        AND (
          ge.subject_id ILIKE ('%' || $1 || '%')
          OR ge.object_id ILIKE ('%' || $1 || '%')
          OR ge.predicate ILIKE ('%' || $1 || '%')
        )
    `;

  if (subjectId) {
    params.push(subjectId);
  }

  const rows = await prisma.$queryRawUnsafe<GraphSearchRow[]>(
    `
      SELECT
        ge.id as "id",
        ge.subject_id as "subjectId",
        ge.predicate as "predicate",
        ge.object_id as "objectId",
        ge.confidence as "confidence",
        ge.source_hash as "sourceHash",
        ge.timestamp as "timestamp"
      FROM "KGEvent" ge
      ${baseWhere}
      ORDER BY ge.confidence DESC, ge.timestamp DESC, ge.id ASC
      LIMIT 40
    `,
    ...params,
  );

  const eventIds = rows.map((row) => row.id);
  const edges: Array<{ fromEvent: string; toEvent: string }> =
    capabilities.temporalEdge && eventIds.length
    ? await prisma.$queryRawUnsafe<Array<{ fromEvent: string; toEvent: string }>>(
        `
          SELECT
            "fromEvent" as "fromEvent",
            "toEvent" as "toEvent"
          FROM "TemporalEdge"
          WHERE "fromEvent" = ANY($1::uuid[])
             OR "toEvent" = ANY($1::uuid[])
        `,
        eventIds,
      )
    : [];

  return rows.map((row) => {
    const recency = recencyScore(new Date(row.timestamp));
    const edgeBoost = edges.some((edge) => edge.fromEvent === row.id || edge.toEvent === row.id)
      ? 0.08
      : 0;
    const graphScore = clamp01(clamp01(row.confidence) * 0.78 + recency * 0.12 + edgeBoost);

    return makeItem(
      "graph",
      row.id,
      `${row.subjectId} ${row.predicate} ${row.objectId}`,
      graphScore,
      {
        subjectId: row.subjectId,
        predicate: row.predicate,
        objectId: row.objectId,
        sourceHash: row.sourceHash,
        retrieval: {
          mode: "postgres-graph",
          recencyScore: recency,
          edgeBoost,
        },
      },
    );
  });
}

async function qdrantHybridSearch(
  query: string,
  subjectId: string | undefined,
  options?: DataAgentRetrievalOptions,
): Promise<DataAgentRetrievalItem[]> {
  const hits = await hybridSearchQdrant({
    query,
    orgId: options?.orgId,
    limit: 40,
  });

  const filtered = subjectId
    ? hits.filter((hit) => {
        const payload = normalizeMetadata(hit.payload);
        return (
          hit.text.includes(subjectId) ||
          String(payload.subjectId ?? "") === subjectId ||
          String(payload.runId ?? "") === subjectId
        );
      })
    : hits;

  return filtered.map((hit) =>
    makeItem(hit.source, hit.id, hit.text, clamp01(hit.score), {
      ...normalizeMetadata(hit.payload),
      retrieval: {
        mode: "qdrant-semantic",
      },
    }),
  );
}

function mergeAndRank(
  exact: DataAgentRetrievalItem[],
  graph: DataAgentRetrievalItem[],
  semantic: DataAgentRetrievalItem[],
  preciseQuery: boolean,
): DataAgentRetrievalItem[] {
  const merged = new Map<string, RankedCandidate>();

  const ingest = (item: DataAgentRetrievalItem) => {
    const recency =
      typeof item.metadata?.retrieval === "object" &&
      item.metadata?.retrieval &&
      typeof (item.metadata.retrieval as JsonRecord).recencyScore === "number"
        ? clamp01((item.metadata.retrieval as JsonRecord).recencyScore as number)
        : 0;
    const existing = merged.get(item.id);

    if (!existing) {
      merged.set(item.id, {
        id: item.id,
        source: item.source,
        text: item.text,
        metadata: normalizeMetadata(item.metadata),
        semanticScore: item.source === "semantic" ? item.score : 0,
        sparseScore: item.source === "sparse" ? item.score : 0,
        graphScore: item.source === "graph" ? item.score : 0,
        confidence: item.score,
        recency,
        mergedSources: new Set([item.source]),
      });
      return;
    }

    existing.semanticScore = Math.max(
      existing.semanticScore,
      item.source === "semantic" ? item.score : 0,
    );
    existing.sparseScore = Math.max(existing.sparseScore, item.source === "sparse" ? item.score : 0);
    existing.graphScore = Math.max(existing.graphScore, item.source === "graph" ? item.score : 0);
    existing.confidence = Math.max(existing.confidence, item.score);
    existing.recency = Math.max(existing.recency, recency);
    existing.mergedSources.add(item.source);
    existing.metadata = {
      ...existing.metadata,
      ...normalizeMetadata(item.metadata),
    };

    const nextSource = preferredSource(existing.source, item.source);
    if (nextSource !== existing.source) {
      existing.source = nextSource;
      existing.text = item.text;
    }
  };

  [...exact, ...graph, ...semantic].forEach(ingest);

  return Array.from(merged.values())
    .map((candidate) => {
      const score = computeFinalScore(candidate, preciseQuery);
      return {
        id: candidate.id,
        source: candidate.source,
        text: candidate.text,
        score,
        metadata: {
          ...candidate.metadata,
          mergedSources: Array.from(candidate.mergedSources).sort(),
          retrieval: {
            ...normalizeMetadata(candidate.metadata.retrieval),
            mode: "orchestrated",
            semanticScore: candidate.semanticScore,
            sparseScore: candidate.sparseScore,
            graphScore: candidate.graphScore,
            preciseQuery,
          },
        },
      } satisfies DataAgentRetrievalItem;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (SOURCE_PRIORITY[right.source] !== SOURCE_PRIORITY[left.source]) {
        return SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, DEFAULT_RETRIEVAL_LIMIT);
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

/**
 * Build a retrieval context for agent runs using exact-first orchestration.
 */
export async function buildDataAgentRetrievalContext(
  query: string,
  subjectId?: string,
  options?: DataAgentRetrievalOptions,
): Promise<DataAgentRetrievalContext> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("query is required");
  }

  const preciseQuery = isPreciseQuery(normalizedQuery);
  const [exact, graph] = await Promise.all([
    exactSearch(normalizedQuery, subjectId, options?.orgId),
    graphSearch(normalizedQuery, subjectId, options?.orgId),
  ]);

  const semanticNeeded =
    canUseQdrantHybridRetrieval() &&
    shouldUseSemanticAugmentation({
      query: normalizedQuery,
      exactResults: [...exact, ...graph]
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_RAW_RESULTS),
    });

  const semantic = semanticNeeded
    ? await qdrantHybridSearch(normalizedQuery, subjectId, options)
    : [];

  const sourceStats = coerceSources(semantic.length, exact.length, graph.length);
  const results = mergeAndRank(exact, graph, semantic, preciseQuery);

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
