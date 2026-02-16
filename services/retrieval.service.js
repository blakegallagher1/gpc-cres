"use strict";
/**
 * Hybrid retrieval service.
 *
 * Combines:
 * - semantic vector similarity via pgvector
 * - sparse lexical similarity via pg_trgm
 * - graph context via KGEvent + TemporalEdge
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedRetrieval = unifiedRetrieval;
exports.createQueryEmbedding = createQueryEmbedding;
const node_module_1 = require("node:module");
const db_1 = require("@entitlement-os/db");
const logger_1 = require("../utils/logger");
const setup_1 = require("../openTelemetry/setup");
const requireModule = (0, node_module_1.createRequire)(import.meta.url);
const telemetry = loadDataAgentTelemetry();
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
let vectorSearchSupportedCache = null;
let sparseSearchSupportedCache = null;
function recordDataAgentRetrieval(payload) {
    telemetry.recordDataAgentRetrieval?.(payload);
}
function loadDataAgentTelemetry() {
    try {
        const sharedTelemetry = requireModule("@entitlement-os/shared");
        if (sharedTelemetry &&
            typeof sharedTelemetry.recordDataAgentRetrieval === "function") {
            return {
                recordDataAgentRetrieval: sharedTelemetry.recordDataAgentRetrieval,
            };
        }
    }
    catch {
        // optional shared dependency fallback
    }
    return {};
}
/**
 * Fetches the top matches from semantic, sparse and graph sources and reranks them.
 */
async function unifiedRetrieval(query, subjectId) {
    const safeQuery = query?.trim();
    if (!safeQuery) {
        throw new Error("query is required");
    }
    const vectorSearchSupported = await (0, setup_1.withSpan)("retrieval.vectorSupportCheck", () => hasVectorSearchSupport());
    const [semantic, sparse, graph] = await Promise.all([
        vectorSearchSupported
            ? (0, setup_1.withSpan)("retrieval.semantic", () => semanticSearch(safeQuery, subjectId).catch((error) => {
                if (isRecoverableVectorError(error)) {
                    logger_1.logger.warn("Vector retrieval unavailable; continuing with sparse/graph", {
                        error: String(error),
                    });
                    return [];
                }
                throw error;
            }))
            : Promise.resolve([]),
        (0, setup_1.withSpan)("retrieval.sparse", () => sparseSearch(safeQuery, subjectId)),
        (0, setup_1.withSpan)("retrieval.graph", () => graphSearch(safeQuery, subjectId)),
    ]);
    const merged = rerank(semantic, sparse, graph);
    merged.sort((a, b) => b.score - a.score);
    const top = merged.slice(0, 20);
    recordDataAgentRetrieval({
        query: safeQuery,
        resultCount: top.length,
        sources: {
            semantic: semantic.length,
            sparse: sparse.length,
            graph: graph.length,
        },
        topScore: top[0]?.score ?? null,
        hasSubjectScope: Boolean(subjectId),
    });
    (0, logger_1.recordRetrievalRun)({
        query: safeQuery,
        resultCount: top.length,
        sources: {
            semantic: semantic.length,
            sparse: sparse.length,
            graph: graph.length,
        },
    });
    logger_1.logger.info("unifiedRetrieval", {
        queryHash: hashString(safeQuery),
        totalResults: top.length,
    });
    return top;
}
/**
 * Embedding creator used by semantic search and tests.
 */
async function createQueryEmbedding(query) {
    const openAI = createOpenAIClient();
    const response = (await openAI.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: query,
        encoding_format: "float",
    }));
    const embedding = response?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("OpenAI embeddings response empty");
    }
    return embedding;
}
async function semanticSearch(query, subjectId) {
    const embedding = await createQueryEmbedding(query);
    const vector = toPgVector(embedding);
    let rows;
    try {
        rows = await db_1.prisma.$queryRawUnsafe(`
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
      `, vector);
    }
    catch (error) {
        if (isRecoverableVectorError(error)) {
            logger_1.logger.warn("Vector retrieval failed due missing pgvector compatibility; falling back", {
                error: String(error),
            });
            return [];
        }
        throw error;
    }
    const filtered = applySubjectFilter(rows, subjectId);
    return filtered.map((row) => {
        const recency = recencyScore(new Date(row.sourceTimestamp));
        const semantic = clamp01(row.semanticScore);
        const metadata = safeMetadata(row.metadata);
        return {
            id: row.id,
            source: "semantic",
            text: row.contentText,
            confidence: semantic,
            recencyScore: recency,
            semanticScore: semantic,
            sparseScore: 0,
            graphScore: 0,
            sourceScore: semantic,
            score: 0,
            metadata,
        };
    });
}
async function sparseSearch(query, subjectId) {
    if (sparseSearchSupportedCache === false) {
        return [];
    }
    let rows;
    try {
        rows = await db_1.prisma.$queryRawUnsafe(`
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
      `, query);
    }
    catch (error) {
        if (isRecoverableSparseError(error)) {
            sparseSearchSupportedCache = false;
            logger_1.logger.warn("Sparse retrieval unavailable; continuing with vector/graph", {
                error: String(error),
            });
            return [];
        }
        throw error;
    }
    sparseSearchSupportedCache = true;
    const filtered = applySubjectFilter(rows, subjectId);
    return filtered.map((row) => {
        const recency = recencyScore(new Date(row.sourceTimestamp));
        const sparse = clamp01(row.sparseScore);
        const metadata = safeMetadata(row.metadata);
        return {
            id: row.id,
            source: "sparse",
            text: row.contentText,
            confidence: 0.6,
            recencyScore: recency,
            semanticScore: 0,
            sparseScore: sparse,
            graphScore: 0,
            sourceScore: sparse,
            score: 0,
            metadata,
        };
    });
}
async function graphSearch(query, subjectId) {
    const params = [query];
    const baseWhere = subjectId
        ? `
      WHERE
        ge.subject_id ILIKE ('%' || $1 || '%')
        OR ge.object_id ILIKE ('%' || $1 || '%')
        OR ge.predicate ILIKE ('%' || $1 || '%')
        OR ge.subject_id = $2
    `
        : `
      WHERE
        ge.subject_id ILIKE ('%' || $1 || '%')
        OR ge.object_id ILIKE ('%' || $1 || '%')
        OR ge.predicate ILIKE ('%' || $1 || '%')
    `;
    if (subjectId) {
        params.push(subjectId);
    }
    const rows = await db_1.prisma.$queryRawUnsafe(`
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
      ORDER BY ge.confidence DESC, ge.timestamp DESC
      LIMIT 40
    `, ...params);
    const eventIds = rows.map((row) => row.id);
    const edges = eventIds.length
        ? await db_1.prisma.$queryRawUnsafe(`
        SELECT
          "fromEvent" as "fromEvent",
          "toEvent" as "toEvent"
        FROM "TemporalEdge"
        WHERE "fromEvent" = ANY($1::text[])
          OR "toEvent" = ANY($1::text[])
      `, eventIds)
        : [];
    return rows.map((row) => {
        const recency = recencyScore(new Date(row.timestamp));
        const confidence = clamp01(row.confidence);
        const edgeBoost = edges.some((edge) => edge.fromEvent === row.id || edge.toEvent === row.id)
            ? 0.08
            : 0;
        const graphScore = clamp01(confidence * 0.75 + edgeBoost);
        return {
            id: row.id,
            source: "graph",
            text: `${row.subjectId} ${row.predicate} ${row.objectId}`,
            subjectId: row.subjectId,
            objectId: row.objectId,
            predicate: row.predicate,
            confidence,
            recencyScore: recency,
            semanticScore: 0,
            sparseScore: 0,
            graphScore,
            sourceScore: graphScore,
            score: 0,
            metadata: {
                sourceHash: row.sourceHash,
            },
        };
    });
}
function rerank(semantic, sparse, graph) {
    const seen = new Map();
    const all = [...semantic, ...sparse, ...graph];
    for (const item of all) {
        const key = item.id;
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, item);
            continue;
        }
        existing.semanticScore = Math.max(existing.semanticScore, item.semanticScore);
        existing.sparseScore = Math.max(existing.sparseScore, item.sparseScore);
        existing.graphScore = Math.max(existing.graphScore, item.graphScore);
        existing.recencyScore = Math.max(existing.recencyScore, item.recencyScore);
        existing.confidence = Math.max(existing.confidence, item.confidence);
        existing.sourceScore = Math.max(existing.sourceScore, item.sourceScore);
    }
    for (const item of seen.values()) {
        item.score = computeScore(item);
    }
    return Array.from(seen.values());
}
function computeScore(item) {
    const score = item.semanticScore * 0.45 +
        item.sparseScore * 0.35 +
        item.graphScore * 0.2 +
        item.recencyScore * 0.15 +
        item.confidence * 0.08;
    return clamp01(score);
}
function recencyScore(timestamp) {
    const ageHours = Math.max(0, (Date.now() - timestamp.getTime()) / 3600000);
    return clamp01(Math.exp(-ageHours / (24 * 7)));
}
function applySubjectFilter(rows, subjectId) {
    if (!subjectId)
        return rows;
    return rows.filter((row) => {
        const metadata = safeMetadata(row.metadata);
        return (String(row.contentText).includes(subjectId) ||
            String(metadata.subjectId ?? "") === subjectId);
    });
}
function safeMetadata(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function createOpenAIClient() {
    const openAIModule = safeRequire("openai");
    if (!openAIModule) {
        throw new Error("openai package is not installed");
    }
    const OpenAIClass = openAIModule.default ?? openAIModule.OpenAI;
    if (!OpenAIClass) {
        throw new Error("OpenAI class export not found");
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for semantic retrieval");
    }
    return new OpenAIClass({ apiKey });
}
function toPgVector(vector) {
    return `[${vector.map((value) => Number(value.toFixed(6)).toString()).join(",")}]`;
}
async function hasVectorSearchSupport() {
    if (vectorSearchSupportedCache !== null) {
        return vectorSearchSupportedCache;
    }
    try {
        const availability = await db_1.prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname IN ('vector', 'pgvector')
      ) AS "available"
      `);
        const isAvailable = extractBooleanResult(availability?.[0]);
        vectorSearchSupportedCache = isAvailable;
        return isAvailable;
    }
    catch (error) {
        vectorSearchSupportedCache = false;
        logger_1.logger.warn("Cannot determine pgvector availability; disabling vector retrieval", {
            error: String(error),
        });
        return false;
    }
}
function extractBooleanResult(row) {
    if (!row || typeof row !== "object") {
        return false;
    }
    const value = row.available ??
        row.exists ??
        row.value ??
        row[Object.keys(row)[0]];
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value === 1;
    if (typeof value === "string")
        return value.toLowerCase() === "true" || value.toLowerCase() === "t";
    return false;
}
function isRecoverableVectorError(error) {
    const message = String(error?.message ?? error).toLowerCase();
    return [
        "pgvector",
        "operator does not exist",
        "vector",
        "no such function",
        "does not exist",
        "undefined function",
        "type vector",
        "cannot cast type",
    ].some((token) => message.includes(token));
}
function isRecoverableSparseError(error) {
    const message = String(error?.message ?? error).toLowerCase();
    return [
        "trigram",
        "gin_trgm_ops",
        "similarity(",
        "operator does not exist",
        "does not exist",
        "pg_trgm",
        "no such operator",
        "undefined function",
    ].some((token) => message.includes(token));
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return `${Math.abs(hash)}`;
}
function safeRequire(moduleName) {
    try {
        return requireModule(moduleName);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=retrieval.service.js.map