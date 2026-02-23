import type { PrismaClient, Prisma } from "@entitlement-os/db";

import { isAgentOsFeatureEnabled } from "../config.js";

export type SemanticFactRecord = {
  id: string;
  key: string;
  valueJson: Prisma.JsonValue;
  confidence: number;
  provenanceEpisodeId: string | null;
  orgId: string;
  updatedAt: Date;
};

export class SemanticMemoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Insert or update a semantic fact. On conflict (orgId + key),
   * only updates if new confidence >= existing confidence.
   */
  async upsert(
    key: string,
    value: Prisma.InputJsonValue,
    confidence: number,
    provenanceEpisodeId: string | null,
    orgId: string,
  ): Promise<void> {
    if (!isAgentOsFeatureEnabled("semanticMemory")) return;

    const existing = await this.prisma.semanticFact.findUnique({
      where: { orgId_key: { orgId, key } },
      select: { confidence: true },
    });

    if (existing && existing.confidence > confidence) return;

    await this.prisma.semanticFact.upsert({
      where: { orgId_key: { orgId, key } },
      create: {
        orgId,
        key,
        valueJson: value,
        confidence,
        provenanceEpisodeId,
      },
      update: {
        valueJson: value,
        confidence,
        provenanceEpisodeId,
      },
    });
  }

  /** Batch fetch facts by key list. */
  async retrieve(keys: string[], orgId: string): Promise<SemanticFactRecord[]> {
    if (!isAgentOsFeatureEnabled("semanticMemory")) return [];
    if (keys.length === 0) return [];

    const rows = await this.prisma.semanticFact.findMany({
      where: { orgId, key: { in: keys } },
    });

    return rows.map(toRecord);
  }

  /** Case-insensitive search across keys and JSON values. */
  async search(query: string, orgId: string): Promise<SemanticFactRecord[]> {
    if (!isAgentOsFeatureEnabled("semanticMemory")) return [];
    if (!query.trim()) return [];

    const rows = await this.prisma.semanticFact.findMany({
      where: {
        orgId,
        OR: [
          { key: { contains: query, mode: "insensitive" } },
          {
            valueJson: {
              path: [],
              string_contains: query,
            },
          },
        ],
      },
      take: 50,
    });

    return rows.map(toRecord);
  }

  /** Return all facts above a confidence threshold. */
  async getAll(orgId: string, minConfidence = 0.5): Promise<SemanticFactRecord[]> {
    if (!isAgentOsFeatureEnabled("semanticMemory")) return [];

    const rows = await this.prisma.semanticFact.findMany({
      where: { orgId, confidence: { gte: minConfidence } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    return rows.map(toRecord);
  }
}

function toRecord(row: {
  id: string;
  key: string;
  valueJson: Prisma.JsonValue;
  confidence: number;
  provenanceEpisodeId: string | null;
  orgId: string;
  updatedAt: Date;
}): SemanticFactRecord {
  return {
    id: row.id,
    key: row.key,
    valueJson: row.valueJson,
    confidence: row.confidence,
    provenanceEpisodeId: row.provenanceEpisodeId,
    orgId: row.orgId,
    updatedAt: row.updatedAt,
  };
}
