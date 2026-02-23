import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { buildHashedSparseVector } from "../qdrant.js";
import { embedText } from "../utils/embedding.js";

type JsonRecord = Record<string, unknown>;

export type EpisodicStoreInput = {
  id?: string;
  summary: string;
  outcome: "SUCCESS" | "FAILURE" | "PARTIAL";
  confidence: number;
  tags: string[];
  agentId: string;
  taskType: string;
  orgId: string;
};

export type ScoredEpisodicEntry = {
  id: string;
  summary: string;
  outcome: string;
  confidence: number;
  agentId: string;
  taskType: string;
  tags: string[];
  createdAt: Date;
  score: number;
};

const RECENCY_HALF_LIFE_DAYS = 30;

function recencyDecay(createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

function successBoost(outcome: string): number {
  if (outcome === "SUCCESS") return 1.0;
  if (outcome === "PARTIAL") return 0.5;
  return 0.0;
}

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

export class EpisodicMemoryStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qdrantUrl: string,
  ) {}

  async store(entry: EpisodicStoreInput): Promise<string> {
    if (!isAgentOsFeatureEnabled("episodicMemory")) {
      throw new Error("Episodic memory is disabled");
    }

    const config = getAgentOsConfig();
    const id = entry.id ?? randomUUID();
    const dense = await embedText(entry.summary);
    const sparse = buildHashedSparseVector(entry.summary);

    await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.episodicMemory)}/points`,
      {
        method: "PUT",
        headers: qdrantHeaders(config.qdrant.apiKey),
        body: JSON.stringify({
          points: [
            {
              id,
              vector: {
                [config.qdrant.denseVectorName]: dense,
                [config.qdrant.sparseVectorName]: sparse,
              },
              payload: {
                agentId: entry.agentId,
                outcome: entry.outcome,
                taskType: entry.taskType,
                orgId: entry.orgId,
                createdAt: Date.now(),
                confidence: entry.confidence,
                summary: entry.summary,
              },
            },
          ],
        }),
      },
    );

    await this.prisma.episodicEntry.upsert({
      where: { id },
      create: {
        id,
        orgId: entry.orgId,
        agentId: entry.agentId,
        taskType: entry.taskType,
        summary: entry.summary,
        embeddingId: id,
        outcome: entry.outcome,
        confidence: entry.confidence,
        tags: entry.tags,
      },
      update: {
        summary: entry.summary,
        outcome: entry.outcome,
        confidence: entry.confidence,
        tags: entry.tags,
      },
    });

    return id;
  }

  async retrieve(
    query: string,
    orgId: string,
    filters?: { agentId?: string; taskType?: string; outcome?: string },
    topK = 5,
  ): Promise<ScoredEpisodicEntry[]> {
    if (!isAgentOsFeatureEnabled("episodicMemory")) return [];

    const config = getAgentOsConfig();
    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);
    const overFetch = Math.max(topK * 2, 10);

    const must: JsonRecord[] = [{ key: "orgId", match: { value: orgId } }];
    if (filters?.agentId) must.push({ key: "agentId", match: { value: filters.agentId } });
    if (filters?.taskType) must.push({ key: "taskType", match: { value: filters.taskType } });
    if (filters?.outcome) must.push({ key: "outcome", match: { value: filters.outcome } });

    const qdrantFilter = { must };
    const collection = config.qdrant.collections.episodicMemory;

    const response = await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`,
      {
        method: "POST",
        headers: qdrantHeaders(config.qdrant.apiKey),
        body: JSON.stringify({
          prefetch: [
            {
              query: dense,
              using: config.qdrant.denseVectorName,
              limit: overFetch,
              filter: qdrantFilter,
            },
            {
              query: sparse,
              using: config.qdrant.sparseVectorName,
              limit: overFetch,
              filter: qdrantFilter,
            },
          ],
          query: { fusion: "rrf" },
          limit: overFetch,
          with_payload: true,
          with_vector: false,
          params: { hnsw_ef: 128, exact: false },
        }),
      },
    );

    if (!response.ok) return [];

    const parsed = (await response.json()) as { result?: { points?: JsonRecord[] } };
    const points = parsed?.result?.points ?? (Array.isArray(parsed?.result) ? (parsed.result as JsonRecord[]) : []);

    const ids = points
      .map((p) => (typeof p.id === "string" ? p.id : null))
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) return [];

    const prismaRows = await this.prisma.episodicEntry.findMany({
      where: { id: { in: ids }, orgId },
    });

    const prismaMap = new Map(prismaRows.map((r) => [r.id, r]));

    const scored: ScoredEpisodicEntry[] = [];
    for (const point of points) {
      const id = typeof point.id === "string" ? point.id : null;
      if (!id) continue;
      const row = prismaMap.get(id);
      if (!row) continue;
      const qdrantScore = typeof point.score === "number" ? point.score : 0;

      const composite =
        qdrantScore * 0.4 +
        successBoost(row.outcome) * 0.3 +
        (row.confidence ?? 0.5) * 0.2 +
        recencyDecay(row.createdAt) * 0.1;

      scored.push({
        id: row.id,
        summary: row.summary,
        outcome: row.outcome,
        confidence: row.confidence,
        agentId: row.agentId,
        taskType: row.taskType,
        tags: row.tags,
        createdAt: row.createdAt,
        score: composite,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async decay(olderThanDays: number, minScore: number): Promise<number> {
    if (!isAgentOsFeatureEnabled("episodicMemory")) return 0;

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const stale = await this.prisma.episodicEntry.findMany({
      where: {
        createdAt: { lt: cutoff },
        confidence: { lt: minScore },
      },
      select: { id: true },
    });

    if (stale.length === 0) return 0;

    const ids = stale.map((r) => r.id);
    await this.prisma.episodicEntry.deleteMany({
      where: { id: { in: ids } },
    });

    return ids.length;
  }
}
