import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { buildHashedSparseVector } from "../qdrant.js";
import { embedText, embedTexts } from "../utils/embedding.js";

type JsonRecord = Record<string, unknown>;

export type DomainDocInput = {
  id?: string;
  sourceType: "ZONING_CODE" | "MARKET_REPORT" | "INTERNAL_MEMO" | "SCHEMA_DOC";
  title: string;
  summary: string;
  contentPointer: string;
  tags: string[];
  orgId: string;
};

export type ScoredDomainDoc = {
  id: string;
  sourceType: string;
  title: string;
  summary: string;
  contentPointer: string;
  tags: string[];
  score: number;
};

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

export class DomainMemoryStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qdrantUrl: string,
  ) {}

  async ingest(doc: DomainDocInput): Promise<string> {
    if (!isAgentOsFeatureEnabled("domainMemory")) {
      throw new Error("Domain memory is disabled");
    }

    const config = getAgentOsConfig();
    const id = doc.id ?? randomUUID();
    const dense = await embedText(doc.summary);
    const sparse = buildHashedSparseVector(doc.summary);

    await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.domainDocs)}/points`,
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
                orgId: doc.orgId,
                sourceType: doc.sourceType,
                tags: doc.tags,
                title: doc.title,
                summary: doc.summary,
              },
            },
          ],
        }),
      },
    );

    await this.prisma.domainDoc.upsert({
      where: { id },
      create: {
        id,
        orgId: doc.orgId,
        sourceType: doc.sourceType,
        title: doc.title,
        summary: doc.summary,
        contentPointer: doc.contentPointer,
        embeddingId: id,
        tags: doc.tags,
      },
      update: {
        title: doc.title,
        summary: doc.summary,
        contentPointer: doc.contentPointer,
        tags: doc.tags,
      },
    });

    return id;
  }

  async retrieve(
    query: string,
    orgId: string,
    sourceType?: string,
    topK = 5,
  ): Promise<ScoredDomainDoc[]> {
    if (!isAgentOsFeatureEnabled("domainMemory")) return [];

    const config = getAgentOsConfig();
    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);
    const overFetch = Math.max(topK * 2, 10);

    const must: JsonRecord[] = [{ key: "orgId", match: { value: orgId } }];
    if (sourceType) must.push({ key: "sourceType", match: { value: sourceType } });
    const qdrantFilter = { must };
    const collection = config.qdrant.collections.domainDocs;

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

    const prismaRows = await this.prisma.domainDoc.findMany({
      where: { id: { in: ids }, orgId },
    });

    const prismaMap = new Map(prismaRows.map((r) => [r.id, r]));

    const scored: ScoredDomainDoc[] = [];
    for (const point of points) {
      const id = typeof point.id === "string" ? point.id : null;
      if (!id) continue;
      const row = prismaMap.get(id);
      if (!row) continue;
      const qdrantScore = typeof point.score === "number" ? point.score : 0;

      scored.push({
        id: row.id,
        sourceType: row.sourceType,
        title: row.title,
        summary: row.summary,
        contentPointer: row.contentPointer,
        tags: row.tags,
        score: qdrantScore,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Batch ingest for bootstrapping. Returns count ingested. */
  async batchIngest(docs: DomainDocInput[]): Promise<number> {
    if (!isAgentOsFeatureEnabled("domainMemory")) return 0;
    if (docs.length === 0) return 0;

    const config = getAgentOsConfig();
    const summaries = docs.map((d) => d.summary);
    const allDense = await embedTexts(summaries);

    const batchSize = 100;
    let ingested = 0;

    for (let offset = 0; offset < docs.length; offset += batchSize) {
      const chunk = docs.slice(offset, offset + batchSize);
      const qdrantPoints = chunk.map((doc, idx) => {
        const globalIdx = offset + idx;
        const id = doc.id ?? randomUUID();
        const sparse = buildHashedSparseVector(doc.summary);
        return {
          id,
          vector: {
            [config.qdrant.denseVectorName]: allDense[globalIdx],
            [config.qdrant.sparseVectorName]: sparse,
          },
          payload: {
            orgId: doc.orgId,
            sourceType: doc.sourceType,
            tags: doc.tags,
            title: doc.title,
            summary: doc.summary,
          },
          _doc: { ...doc, id },
        };
      });

      await fetch(
        `${this.qdrantUrl}/collections/${encodeURIComponent(config.qdrant.collections.domainDocs)}/points`,
        {
          method: "PUT",
          headers: qdrantHeaders(config.qdrant.apiKey),
          body: JSON.stringify({
            points: qdrantPoints.map(({ _doc: _, ...rest }) => rest),
          }),
        },
      );

      for (const qp of qdrantPoints) {
        const d = qp._doc;
        await this.prisma.domainDoc.upsert({
          where: { id: d.id },
          create: {
            id: d.id,
            orgId: d.orgId,
            sourceType: d.sourceType,
            title: d.title,
            summary: d.summary,
            contentPointer: d.contentPointer,
            embeddingId: d.id,
            tags: d.tags,
          },
          update: {
            title: d.title,
            summary: d.summary,
            contentPointer: d.contentPointer,
            tags: d.tags,
          },
        });
      }

      ingested += chunk.length;
    }

    return ingested;
  }
}
