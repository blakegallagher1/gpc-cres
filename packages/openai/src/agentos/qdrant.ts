import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";

import { createEmbedding } from "../embeddings.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "./config.js";

type JsonRecord = Record<string, unknown>;

export type SparseVector = {
  indices: number[];
  values: number[];
};

export type QdrantHybridSearchParams = {
  query: string;
  orgId?: string;
  limit?: number;
  filter?: JsonRecord;
  collection?: string;
};

export type QdrantHybridSearchHit = {
  id: string;
  score: number;
  source: "semantic" | "sparse";
  text: string;
  payload: JsonRecord;
};

export type QdrantMemoryWriteInput = {
  orgId: string;
  conversationId: string;
  userId: string;
  content: string;
  metadata?: JsonRecord;
  pointId?: string;
  collection?: string;
};

let cachedClient: QdrantClient | null = null;

function getQdrantBaseUrl(): string {
  const url = getAgentOsConfig().qdrant.url;
  if (!url) {
    throw new Error("QDRANT_URL is required when AgentOS Qdrant retrieval is enabled");
  }
  return url;
}

function getQdrantClient(): QdrantClient {
  if (cachedClient) {
    return cachedClient;
  }
  const config = getAgentOsConfig();
  if (!config.qdrant.url) {
    throw new Error("QDRANT_URL is required when creating Qdrant client");
  }
  cachedClient = new QdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey ?? undefined,
  });
  return cachedClient;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 50000;
}

export function buildHashedSparseVector(text: string, maxTerms = 64): SparseVector {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { indices: [], values: [] };
  }

  const termCounts = new Map<number, number>();
  for (const token of tokens) {
    const index = hashToken(token);
    termCounts.set(index, (termCounts.get(index) ?? 0) + 1);
  }

  const ranked = [...termCounts.entries()]
    .map(([index, count]) => ({
      index,
      score: Math.log(1 + count),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTerms);

  const norm = Math.sqrt(ranked.reduce((acc, item) => acc + item.score * item.score, 0)) || 1;
  return {
    indices: ranked.map((item) => item.index),
    values: ranked.map((item) => Number((item.score / norm).toFixed(6))),
  };
}

function buildOrgFilter(orgId?: string, extraFilter?: JsonRecord): JsonRecord | undefined {
  const must: JsonRecord[] = [];
  if (orgId) {
    must.push({
      key: "orgId",
      match: { value: orgId },
    });
  }

  if (extraFilter && Object.keys(extraFilter).length > 0) {
    must.push(extraFilter);
  }

  if (must.length === 0) {
    return undefined;
  }

  return { must };
}

function parseHybridPoints(payload: unknown): QdrantHybridSearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as JsonRecord;
  const result = record.result;
  const points =
    Array.isArray(result)
      ? result
      : result && typeof result === "object" && Array.isArray((result as JsonRecord).points)
        ? ((result as JsonRecord).points as unknown[])
        : [];

  return points
    .map((raw): QdrantHybridSearchHit | null => {
      if (!raw || typeof raw !== "object") return null;
      const point = raw as JsonRecord;
      const id = point.id;
      const score = point.score;
      const payloadValue = point.payload;
      if ((typeof id !== "string" && typeof id !== "number") || typeof score !== "number") {
        return null;
      }
      const normalizedPayload =
        payloadValue && typeof payloadValue === "object" && !Array.isArray(payloadValue)
          ? (payloadValue as JsonRecord)
          : {};
      const textCandidate = normalizedPayload.text ?? normalizedPayload.content ?? normalizedPayload.summary;

      return {
        id: String(id),
        score,
        source: "semantic",
        text: typeof textCandidate === "string" ? textCandidate : "",
        payload: normalizedPayload,
      };
    })
    .filter((item): item is QdrantHybridSearchHit => Boolean(item));
}

function clampLimit(value: number | undefined): number {
  if (!value) return 8;
  if (!Number.isFinite(value)) return 8;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export function canUseQdrantHybridRetrieval(): boolean {
  return isAgentOsFeatureEnabled("qdrantHybridRetrieval") && Boolean(getAgentOsConfig().qdrant.url);
}

export async function writeMemoryToQdrant(input: QdrantMemoryWriteInput): Promise<string> {
  if (!canUseQdrantHybridRetrieval()) {
    throw new Error("AgentOS Qdrant hybrid retrieval is disabled");
  }
  const config = getAgentOsConfig();
  const collection = input.collection ?? config.qdrant.collections.episodicMemory;
  const id = input.pointId ?? randomUUID();
  const dense = await createEmbedding(input.content, config.models.embedding, {
    dimensions: config.models.embeddingDimensions,
  });
  const sparse = buildHashedSparseVector(input.content);

  const client = getQdrantClient() as unknown as {
    upsert: (collectionName: string, request: unknown) => Promise<unknown>;
  };

  await client.upsert(collection, {
    wait: false,
    points: [
      {
        id,
        vector: {
          [config.qdrant.denseVectorName]: dense,
          [config.qdrant.sparseVectorName]: sparse,
        },
        payload: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          userId: input.userId,
          text: input.content,
          createdAt: new Date().toISOString(),
          ...(input.metadata ?? {}),
        },
      },
    ],
  });

  return id;
}

export async function hybridSearchQdrant(
  params: QdrantHybridSearchParams,
): Promise<QdrantHybridSearchHit[]> {
  if (!canUseQdrantHybridRetrieval()) {
    return [];
  }
  const config = getAgentOsConfig();
  const collection = params.collection ?? config.qdrant.collections.episodicMemory;
  const limit = clampLimit(params.limit);
  const dense = await createEmbedding(params.query, config.models.embedding, {
    dimensions: config.models.embeddingDimensions,
  });
  const sparse = buildHashedSparseVector(params.query);
  const orgFilter = buildOrgFilter(params.orgId, params.filter);

  const qdrantBody: JsonRecord = {
    prefetch: [
      {
        query: dense,
        using: config.qdrant.denseVectorName,
        limit: Math.max(limit * 3, 20),
        filter: orgFilter,
      },
      {
        query: sparse,
        using: config.qdrant.sparseVectorName,
        limit: Math.max(limit * 3, 20),
        filter: orgFilter,
      },
    ],
    query: { fusion: "rrf" },
    limit,
    with_payload: true,
    with_vector: false,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.qdrant.apiKey) {
    headers["api-key"] = config.qdrant.apiKey;
  }

  const response = await fetch(
    `${getQdrantBaseUrl()}/collections/${encodeURIComponent(collection)}/points/query`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(qdrantBody),
    },
  );

  if (response.ok) {
    const parsed = (await response.json()) as unknown;
    const hits = parseHybridPoints(parsed);
    if (hits.length > 0) {
      return hits.slice(0, limit);
    }
  }

  const fallbackClient = getQdrantClient() as unknown as {
    search: (collectionName: string, request: unknown) => Promise<unknown>;
  };
  const fallbackResult = await fallbackClient.search(collection, {
    vector: {
      name: config.qdrant.denseVectorName,
      vector: dense,
    },
    limit,
    with_payload: true,
    with_vector: false,
    filter: orgFilter,
  });
  return parseHybridPoints({ result: fallbackResult }).slice(0, limit);
}

