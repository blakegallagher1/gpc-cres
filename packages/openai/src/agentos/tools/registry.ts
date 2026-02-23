import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { embedText } from "../utils/embedding.js";
import { buildHashedSparseVector } from "../qdrant.js";

type JsonRecord = Record<string, unknown>;

export type ToolSpecRecord = {
  id: string;
  name: string;
  description: string;
  riskLevel: string;
  errorRate: number;
  latencyStats: JsonRecord;
  costStats: JsonRecord;
};

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

function extractToolMeta(tool: unknown): { name: string; description: string } | null {
  if (!tool || typeof tool !== "object") return null;
  const rec = tool as JsonRecord;
  const name = typeof rec.name === "string" ? rec.name.trim() : null;
  if (!name) return null;
  const description = typeof rec.description === "string" ? rec.description : name;
  return { name, description };
}

export class ToolRegistry {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qdrantUrl: string,
  ) {}

  /**
   * Bootstrap: scan tool arrays and ensure each has a ToolSpec row + Qdrant point.
   * Idempotent — skips tools that already exist for the given orgId.
   */
  async initialize(allTools: readonly unknown[], orgId: string): Promise<number> {
    if (!isAgentOsFeatureEnabled("dynamicToolRegistry")) return 0;

    const config = getAgentOsConfig();
    let synced = 0;

    for (const tool of allTools) {
      const meta = extractToolMeta(tool);
      if (!meta) continue;

      const existing = await this.prisma.toolSpec.findUnique({
        where: { orgId_name: { orgId, name: meta.name } },
        select: { id: true },
      });

      if (existing) continue;

      const id = randomUUID();
      const dense = await embedText(meta.description);
      const sparse = buildHashedSparseVector(meta.description);

      await fetch(
        `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.toolSpecs)}/points`,
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
                  orgId,
                  name: meta.name,
                  riskLevel: "LOW",
                },
              },
            ],
          }),
        },
      );

      await this.prisma.toolSpec.create({
        data: {
          id,
          orgId,
          name: meta.name,
          description: meta.description,
          inputSchemaJson: {},
          outputSchemaJson: {},
          riskLevel: "LOW",
          retryPolicy: { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 8000, multiplier: 2 },
          permissionScope: "default",
          costStats: { avgCostUsd: 0, totalCostUsd: 0, invokeCount: 0 },
          latencyStats: { p50Ms: 0, p95Ms: 0, p99Ms: 0, avgMs: 0 },
          errorRate: 0,
          embeddingId: id,
        },
      });

      synced++;
    }

    return synced;
  }

  async get(name: string, orgId: string): Promise<ToolSpecRecord | null> {
    if (!isAgentOsFeatureEnabled("dynamicToolRegistry")) return null;

    const row = await this.prisma.toolSpec.findUnique({
      where: { orgId_name: { orgId, name } },
    });

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      riskLevel: row.riskLevel,
      errorRate: row.errorRate,
      latencyStats: row.latencyStats as JsonRecord,
      costStats: row.costStats as JsonRecord,
    };
  }

  async search(query: string, orgId: string, topK = 5): Promise<ToolSpecRecord[]> {
    if (!isAgentOsFeatureEnabled("dynamicToolRegistry")) return [];

    const config = getAgentOsConfig();
    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);

    const qdrantFilter = { must: [{ key: "orgId", match: { value: orgId } }] };

    const response = await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.toolSpecs)}/points/query`,
      {
        method: "POST",
        headers: qdrantHeaders(config.qdrant.apiKey),
        body: JSON.stringify({
          prefetch: [
            { query: dense, using: config.qdrant.denseVectorName, limit: topK * 2, filter: qdrantFilter },
            { query: sparse, using: config.qdrant.sparseVectorName, limit: topK * 2, filter: qdrantFilter },
          ],
          query: { fusion: "rrf" },
          limit: topK,
          with_payload: true,
          with_vector: false,
        }),
      },
    );

    if (!response.ok) return [];

    const parsed = (await response.json()) as { result?: { points?: JsonRecord[] } };
    const points = parsed?.result?.points ?? (Array.isArray(parsed?.result) ? (parsed.result as JsonRecord[]) : []);

    const names = points
      .map((p) => {
        const payload = p.payload as JsonRecord | undefined;
        return typeof payload?.name === "string" ? payload.name : null;
      })
      .filter((n): n is string => Boolean(n));

    if (names.length === 0) return [];

    const rows = await this.prisma.toolSpec.findMany({
      where: { orgId, name: { in: names } },
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      riskLevel: r.riskLevel,
      errorRate: r.errorRate,
      latencyStats: r.latencyStats as JsonRecord,
      costStats: r.costStats as JsonRecord,
    }));
  }

  async recordExecution(
    name: string,
    orgId: string,
    latencyMs: number,
    success: boolean,
    _tokensUsed: number,
  ): Promise<void> {
    if (!isAgentOsFeatureEnabled("dynamicToolRegistry")) return;

    const row = await this.prisma.toolSpec.findUnique({
      where: { orgId_name: { orgId, name } },
      select: { id: true, errorRate: true, latencyStats: true, costStats: true },
    });
    if (!row) return;

    const stats = (row.costStats ?? {}) as JsonRecord;
    const invokeCount = (typeof stats.invokeCount === "number" ? stats.invokeCount : 0) + 1;
    const latStats = (row.latencyStats ?? {}) as JsonRecord;

    const alpha = Math.min(1, 2 / (invokeCount + 1));
    const prevAvg = typeof latStats.avgMs === "number" ? latStats.avgMs : 0;
    const newAvg = prevAvg * (1 - alpha) + latencyMs * alpha;

    const prevErrorRate = row.errorRate;
    const newErrorRate = prevErrorRate * (1 - alpha) + (success ? 0 : 1) * alpha;

    await this.prisma.toolSpec.update({
      where: { id: row.id },
      data: {
        errorRate: newErrorRate,
        latencyStats: { ...latStats, avgMs: newAvg },
        costStats: { ...stats, invokeCount },
      },
    });
  }
}
