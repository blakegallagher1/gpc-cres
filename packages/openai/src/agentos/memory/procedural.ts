import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { buildHashedSparseVector } from "../qdrant.js";
import { embedText } from "../utils/embedding.js";

type JsonRecord = Record<string, unknown>;

export type ProceduralSkillInput = {
  id?: string;
  name: string;
  description: string;
  skillMdContent: string;
  toolSequence: string[];
  dedupeHash: string;
  orgId: string;
};

export type ScoredSkill = {
  id: string;
  name: string;
  description: string;
  skillMdContent: string;
  toolSequence: string[];
  successRate: number;
  evaluatorAvgScore: number;
  score: number;
};

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

export class SkillStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qdrantUrl: string,
  ) {}

  async store(skill: ProceduralSkillInput): Promise<string> {
    if (!isAgentOsFeatureEnabled("proceduralMemory")) {
      throw new Error("Procedural memory is disabled");
    }

    const config = getAgentOsConfig();
    const id = skill.id ?? randomUUID();
    const dense = await embedText(skill.description);
    const sparse = buildHashedSparseVector(skill.description);

    await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.skillTriggers)}/points`,
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
                orgId: skill.orgId,
                name: skill.name,
                successRate: 0,
                evaluatorAvgScore: 0,
              },
            },
          ],
        }),
      },
    );

    await this.prisma.proceduralSkill.upsert({
      where: { orgId_dedupeHash: { orgId: skill.orgId, dedupeHash: skill.dedupeHash } },
      create: {
        id,
        orgId: skill.orgId,
        name: skill.name,
        description: skill.description,
        skillMdContent: skill.skillMdContent,
        toolSequence: skill.toolSequence,
        dedupeHash: skill.dedupeHash,
        embeddingId: id,
      },
      update: {
        name: skill.name,
        description: skill.description,
        skillMdContent: skill.skillMdContent,
        toolSequence: skill.toolSequence,
      },
    });

    return id;
  }

  async retrieve(query: string, orgId: string, topK = 3): Promise<ScoredSkill[]> {
    if (!isAgentOsFeatureEnabled("proceduralMemory")) return [];

    const config = getAgentOsConfig();
    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);
    const overFetch = Math.max(topK * 2, 10);

    const qdrantFilter = { must: [{ key: "orgId", match: { value: orgId } }] };
    const collection = config.qdrant.collections.skillTriggers;

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

    const prismaRows = await this.prisma.proceduralSkill.findMany({
      where: { id: { in: ids }, orgId },
    });

    const prismaMap = new Map(prismaRows.map((r) => [r.id, r]));

    const scored: ScoredSkill[] = [];
    for (const point of points) {
      const id = typeof point.id === "string" ? point.id : null;
      if (!id) continue;
      const row = prismaMap.get(id);
      if (!row) continue;
      const qdrantScore = typeof point.score === "number" ? point.score : 0;

      const composite =
        qdrantScore * 0.3 +
        row.successRate * 0.35 +
        row.evaluatorAvgScore * 0.35;

      scored.push({
        id: row.id,
        name: row.name,
        description: row.description,
        skillMdContent: row.skillMdContent,
        toolSequence: row.toolSequence,
        successRate: row.successRate,
        evaluatorAvgScore: row.evaluatorAvgScore,
        score: composite,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async updateMetrics(skillId: string, success: boolean, evaluatorScore: number): Promise<void> {
    if (!isAgentOsFeatureEnabled("proceduralMemory")) return;

    const row = await this.prisma.proceduralSkill.findUnique({
      where: { id: skillId },
      select: { successCount: true, failCount: true, evaluatorAvgScore: true },
    });
    if (!row) return;

    const newSuccess = row.successCount + (success ? 1 : 0);
    const newFail = row.failCount + (success ? 0 : 1);
    const total = newSuccess + newFail;
    const newRate = total > 0 ? newSuccess / total : 0;

    const alpha = 0.3;
    const newAvgScore = row.evaluatorAvgScore * (1 - alpha) + evaluatorScore * alpha;

    await this.prisma.proceduralSkill.update({
      where: { id: skillId },
      data: {
        successCount: newSuccess,
        failCount: newFail,
        successRate: newRate,
        evaluatorAvgScore: newAvgScore,
      },
    });
  }

  async checkDuplicate(dedupeHash: string, orgId: string): Promise<boolean> {
    if (!isAgentOsFeatureEnabled("proceduralMemory")) return false;
    const count = await this.prisma.proceduralSkill.count({
      where: { orgId, dedupeHash },
    });
    return count > 0;
  }
}
