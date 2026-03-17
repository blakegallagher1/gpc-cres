import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { buildHashedSparseVector } from "../qdrant.js";
import { embedText } from "../utils/embedding.js";

type JsonRecord = Record<string, unknown>;

const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 200;

export type DocumentIntelligenceInput = {
  orgId: string;
  uploadId: string;
  dealId: string | null;
  docType: string;
  filename: string;
  rawText: string;
};

export type DocumentIntelligenceHit = {
  uploadId: string;
  dealId: string | null;
  docType: string;
  filename: string;
  text: string;
  chunkIndex: number;
  score: number;
};

function qdrantHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["api-key"] = apiKey;
  return h;
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export class DocumentIntelligenceStore {
  constructor(private readonly qdrantUrl: string) {}

  async createIfNotExists(): Promise<void> {
    const config = getAgentOsConfig();
    const collectionName = config.qdrant.collections.documentIntelligence;
    const headers = qdrantHeaders(config.qdrant.apiKey);

    try {
      const checkRes = await fetch(
        `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
        { headers },
      );
      if (checkRes.ok) return;
    } catch {
      // Collection missing — continue to create
    }

    const createRes = await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          vectors: {
            [config.qdrant.denseVectorName]: {
              size: config.models.embeddingDimensions,
              distance: "Cosine",
            },
          },
          sparse_vectors: {
            [config.qdrant.sparseVectorName]: {},
          },
          optimizers_config: {
            default_segment_number: 4,
          },
        }),
      },
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(`[DocumentIntelligence] Failed to create collection: ${text}`);
    }
  }

  async upsert(input: DocumentIntelligenceInput): Promise<number> {
    if (!isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
      return 0;
    }

    const config = getAgentOsConfig();
    const collectionName = config.qdrant.collections.documentIntelligence;
    const headers = qdrantHeaders(config.qdrant.apiKey);

    await this.createIfNotExists();

    const chunks = chunkText(input.rawText);

    // Delete any existing points for this uploadId before re-indexing
    await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points/delete`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: {
            must: [{ key: "upload_id", match: { value: input.uploadId } }],
          },
        }),
      },
    ).catch(() => {});

    // Embed and upsert each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const dense = await embedText(chunk);
      const sparse = buildHashedSparseVector(chunk);

      const pointId = `${input.uploadId}-${i}`;

      const upsertRes = await fetch(
        `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            points: [
              {
                id: pointId,
                vector: {
                  [config.qdrant.denseVectorName]: dense,
                  [config.qdrant.sparseVectorName]: sparse,
                },
                payload: {
                  org_id: input.orgId,
                  upload_id: input.uploadId,
                  deal_id: input.dealId,
                  doc_type: input.docType,
                  filename: input.filename,
                  text: chunk,
                  chunk_index: i,
                  total_chunks: chunks.length,
                  created_at: new Date().toISOString(),
                },
              },
            ],
          }),
        },
      );

      if (!upsertRes.ok) {
        console.error(
          `[DocumentIntelligence] Qdrant upsert failed for chunk ${i}/${chunks.length}: ${upsertRes.status}`,
        );
      }
    }

    console.log(
      `[DocumentIntelligence] Indexed ${chunks.length} chunk(s) for ${input.filename} (${input.docType})`,
    );
    return chunks.length;
  }

  async search(
    query: string,
    orgId: string,
    options?: { dealId?: string; docType?: string; topK?: number },
  ): Promise<DocumentIntelligenceHit[]> {
    if (!isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
      return [];
    }

    const config = getAgentOsConfig();
    const collectionName = config.qdrant.collections.documentIntelligence;
    const topK = options?.topK ?? 5;
    const overFetch = Math.max(topK * 3, 15);

    const dense = await embedText(query);
    const sparse = buildHashedSparseVector(query);

    const must: JsonRecord[] = [{ key: "org_id", match: { value: orgId } }];
    if (options?.dealId) {
      must.push({ key: "deal_id", match: { value: options.dealId } });
    }
    if (options?.docType) {
      must.push({ key: "doc_type", match: { value: options.docType } });
    }
    const qdrantFilter = { must };

    const res = await fetch(
      `${this.qdrantUrl}/collections/${encodeURIComponent(collectionName)}/points/query`,
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

    if (!res.ok) {
      console.error(`[DocumentIntelligence] Search failed: ${res.status}`);
      return [];
    }

    const parsed = (await res.json()) as {
      result?: { points?: JsonRecord[] };
    };
    const points = parsed?.result?.points ?? [];

    const hits: DocumentIntelligenceHit[] = [];
    for (const point of points) {
      const score = typeof point.score === "number" ? point.score : 0;
      const payload = point.payload as JsonRecord | undefined;
      if (!payload) continue;

      hits.push({
        uploadId: String(payload.upload_id ?? ""),
        dealId: payload.deal_id ? String(payload.deal_id) : null,
        docType: String(payload.doc_type ?? ""),
        filename: String(payload.filename ?? ""),
        text: String(payload.text ?? ""),
        chunkIndex: typeof payload.chunk_index === "number" ? payload.chunk_index : 0,
        score,
      });
    }

    return hits.slice(0, topK);
  }
}
