/**
 * Backward-compatible wrapper over the exact-first Data Agent retriever.
 */

import { createRequire } from "node:module";

import { buildDataAgentRetrievalContext } from "@entitlement-os/openai";

type JsonRecord = Record<string, unknown>;
export type RetrievalSource = "semantic" | "sparse" | "graph";

export interface UnifiedRetrievalRecord {
  id: string;
  source: RetrievalSource;
  text: string;
  subjectId?: string;
  objectId?: string;
  predicate?: string;
  confidence: number;
  recencyScore: number;
  semanticScore: number;
  sparseScore: number;
  graphScore: number;
  sourceScore: number;
  score: number;
  metadata: JsonRecord;
}

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";
const requireModule = createRequire(import.meta.url);

export async function unifiedRetrieval(
  query: string,
  subjectId?: string,
  orgId?: string,
): Promise<UnifiedRetrievalRecord[]> {
  const safeQuery = query?.trim();
  if (!safeQuery) {
    throw new Error("query is required");
  }

  const context = await buildDataAgentRetrievalContext(safeQuery, subjectId, { orgId });
  return context.results.map((item) => {
    const metadata = safeMetadata(item.metadata);
    const retrievalMetadata = safeMetadata(metadata.retrieval);
    const semanticScore =
      typeof retrievalMetadata.semanticScore === "number"
        ? clamp01(retrievalMetadata.semanticScore)
        : item.source === "semantic"
          ? clamp01(item.score)
          : 0;
    const sparseScore =
      typeof retrievalMetadata.sparseScore === "number"
        ? clamp01(retrievalMetadata.sparseScore)
        : item.source === "sparse"
          ? clamp01(item.score)
          : 0;
    const graphScore =
      typeof retrievalMetadata.graphScore === "number"
        ? clamp01(retrievalMetadata.graphScore)
        : item.source === "graph"
          ? clamp01(item.score)
          : 0;
    const recencyScore =
      typeof retrievalMetadata.recencyScore === "number"
        ? clamp01(retrievalMetadata.recencyScore)
        : 0;

    return {
      id: item.id,
      source: item.source,
      text: item.text,
      subjectId: stringOrUndefined(metadata.subjectId),
      objectId: stringOrUndefined(metadata.objectId),
      predicate: stringOrUndefined(metadata.predicate),
      confidence: clamp01(item.score),
      recencyScore,
      semanticScore,
      sparseScore,
      graphScore,
      sourceScore: clamp01(item.score),
      score: clamp01(item.score),
      metadata,
    };
  });
}

/**
 * Embedding creator retained for compatibility with focused tests and legacy callers.
 */
export async function createQueryEmbedding(query: string): Promise<number[]> {
  const openAI = createOpenAIClient();
  const response = (await openAI.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: query,
    encoding_format: "float",
    dimensions: 1536,
  })) as { data?: Array<{ embedding?: number[] }> };
  const embedding = response?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenAI embeddings response empty");
  }
  return embedding;
}

function safeMetadata(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function createOpenAIClient(): {
  embeddings: { create: (payload: unknown) => Promise<unknown> };
} {
  const openAIModule = safeRequire<any>("openai");
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

function safeRequire<T>(moduleName: string): T | null {
  try {
    return requireModule(moduleName) as T;
  } catch {
    return null;
  }
}
