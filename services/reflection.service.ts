/**
 * Reflection pipeline that evolves memory after each episode:
 * - creates/refreshes vectorized embeddings
 * - extracts and stores KG events
 * - adds temporal edges
 * - emits review tickets for low-confidence episodes
 */

import { createRequire } from "node:module";
import { prisma } from "@entitlement-os/db";
import { logger } from "../utils/logger";
import { withSpan } from "../openTelemetry/setup.ts";
import { EpisodeRecord } from "./episode.service";

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const requireModule = createRequire(import.meta.url);

type JsonRecord = Record<string, unknown>;
type KGTriple = {
  subjectId: string;
  predicate: string;
  objectId: string;
  confidence?: number;
};

type ReflectionResult = {
  episodeId: string;
  embeddingId: string;
  graphEventsCreated: number;
  temporalEdgesCreated: number;
  lowConfidenceTicketCreated: boolean;
};

/**
 * Reflect and persist memory updates from an episode.
 */
export async function reflectAndUpdateMemory(episode: EpisodeRecord): Promise<ReflectionResult> {
  validateEpisode(episode);

  const summaryText = `${episode.agentIntent} ${episode.summary ?? ""}`;
  const runEmbedding = await withSpan("reflectAndUpdateMemory.embed", () => createEmbedding(summaryText));
  const vectorLiteral = toVectorLiteral(runEmbedding);

  const createdEmbedding = await withSpan("reflectAndUpdateMemory.embeddingUpsert", () =>
    prisma.knowledgeEmbedding.create({
      data: {
        contentType: "episode",
        sourceId: episode.id,
        contentText: episode.summary ?? episode.outcomeSignal ?? "",
        metadata: {
          runId: episode.runId,
          evidenceHash: episode.evidenceHash,
          source: "reflection",
        },
      },
    }),
  );

  await storeEpisodeEmbedding(createdEmbedding.id, vectorLiteral);

  const triples = extractTriplesFromEpisode(episode);
  const createdEvents = await createGraphEvents(
    triples,
    episode.evidenceHash,
    episode.confidence,
  );
  const temporalEdgesCreated = await createTemporalEdges(createdEvents, episode.id);

  let ticketCreated = false;
  if (typeof episode.confidence === "number" && episode.confidence < 0.45) {
    await withSpan("reflectAndUpdateMemory.lowConfidenceTicket", () =>
      prisma.kGEvent.create({
        data: {
          subjectId: episode.id,
          predicate: "LOW_CONFIDENCE_TICKET",
          objectId: episode.runId,
          confidence: Math.max(0, episode.confidence),
          sourceHash: episode.evidenceHash,
        },
      }),
    );
    ticketCreated = true;
  }

  logger.info("Reflection completed", {
    episodeId: episode.id,
    graphEventsCreated: createdEvents.length,
    temporalEdgesCreated,
    lowConfidenceTicketCreated: ticketCreated,
  });

  return {
    episodeId: episode.id,
    embeddingId: createdEmbedding.id,
    graphEventsCreated: createdEvents.length,
    temporalEdgesCreated,
    lowConfidenceTicketCreated: ticketCreated,
  };
}

async function createGraphEvents(
  triples: KGTriple[],
  sourceHash: string,
  confidence: number | null,
): Promise<string[]> {
  const createdIds: string[] = [];

  for (const triple of triples) {
    const event = await withSpan("reflectAndUpdateMemory.createGraphEvent", () =>
      prisma.kGEvent.create({
        data: {
          subjectId: triple.subjectId,
          predicate: triple.predicate,
          objectId: triple.objectId,
          confidence: clamp01(triple.confidence ?? confidence ?? 0.6),
          sourceHash,
        },
      }),
    );
    createdIds.push(event.id);
  }

  return createdIds;
}

async function createTemporalEdges(eventIds: string[], episodeId: string): Promise<number> {
  let createdCount = 0;
  if (eventIds.length <= 1) {
    return 0;
  }

  for (let i = 1; i < eventIds.length; i += 1) {
    await withSpan("reflectAndUpdateMemory.createTemporalEdge", () =>
      prisma.temporalEdge.create({
        data: {
          fromEvent: eventIds[i - 1],
          toEvent: eventIds[i],
          relation: `episode:${episodeId}:sequence`,
        },
      }),
    );
    createdCount += 1;
  }
  return createdCount;
}

function extractTriplesFromEpisode(episode: EpisodeRecord): KGTriple[] {
  const triples: KGTriple[] = [];
  const candidateSources = episode.modelOutputs as Record<string, unknown>;

  const explicitTriples = candidateSources.knowledgeTriples;
  if (Array.isArray(explicitTriples)) {
    for (const raw of explicitTriples as unknown[]) {
      const triple = parseTriple(raw);
      if (triple) {
        triples.push(triple);
      }
    }
  }

  const fallbackText = [
    episode.summary ?? "",
    JSON.stringify(candidateSources ?? {}).slice(0, 6000),
  ].join("\n");
  if (!triples.length && fallbackText.trim()) {
    const heuristic = fallbackText.match(/([A-Za-z0-9_.-]+)\s+([a-z_]+)\s+([A-Za-z0-9_.-]+)/g);
    if (heuristic) {
      for (const hit of heuristic) {
        const parts = hit.split(/\s+/);
        if (parts.length === 3) {
          const triple = parseTriple({
            subjectId: parts[0],
            predicate: parts[1],
            objectId: parts[2],
          });
          if (triple) {
            triples.push(triple);
          }
        }
      }
    }
  }

  return dedupeTriples(triples);
}

function dedupeTriples(input: KGTriple[]): KGTriple[] {
  const seen = new Set<string>();
  const out: KGTriple[] = [];
  for (const triple of input) {
    const key = `${triple.subjectId}::${triple.predicate}::${triple.objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(triple);
  }
  return out;
}

function parseTriple(raw: unknown): KGTriple | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const subjectId = candidate.subjectId;
  const predicate = candidate.predicate;
  const objectId = candidate.objectId;
  if (
    typeof subjectId !== "string" ||
    typeof predicate !== "string" ||
    typeof objectId !== "string"
  ) {
    return null;
  }
  const confidenceRaw = candidate.confidence;
  const confidence = typeof confidenceRaw === "number" ? confidenceRaw : undefined;
  return {
    subjectId: subjectId.trim(),
    predicate: predicate.trim(),
    objectId: objectId.trim(),
    confidence,
  };
}

async function createEmbedding(input: string): Promise<number[]> {
  const openAIClient = createOpenAIClient();
  const response = (await openAIClient.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input,
    encoding_format: "float",
  })) as { data?: Array<{ embedding?: number[] }> };
  const embedding = response?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenAI embeddings response was empty");
  }
  return embedding;
}

function createOpenAIClient(): { embeddings: { create: (payload: unknown) => Promise<unknown> } } {
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
    throw new Error("OPENAI_API_KEY is required for reflection embedding");
  }
  return new OpenAIClass({ apiKey });
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((item) => Number(item.toFixed(6)).toString()).join(",")}]`;
}

async function storeEpisodeEmbedding(
  embeddingId: string,
  vectorLiteral: string,
): Promise<void> {
  try {
    await withSpan("reflectAndUpdateMemory.storeVector", () =>
      prisma.$queryRawUnsafe(
        `
        UPDATE "KnowledgeEmbedding" 
        SET "vector_embedding" = $1::vector 
        WHERE "id" = $2
        `,
        vectorLiteral,
        embeddingId,
      ),
    );
    return;
  } catch (error) {
    if (!isRecoverableVectorError(error)) {
      logger.error("Failed to store episode vector embedding", {
        error: String(error),
        embeddingId,
      });
      throw error;
    }

    logger.warn("Vector embedding storage unavailable; persisting sparse embedding fallback", {
      embeddingId,
      error: String(error),
    });

    await withSpan("reflectAndUpdateMemory.storeVectorFallback", () =>
      prisma.$queryRawUnsafe(
        `
        UPDATE "KnowledgeEmbedding" 
        SET "embedding" = $1::double precision[] 
        WHERE "id" = $2
        `,
        vectorLiteral,
        embeddingId,
      ),
    );
  }
}

function isRecoverableVectorError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error).toLowerCase();
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validateEpisode(episode: EpisodeRecord): void {
  if (!episode || typeof episode !== "object") {
    throw new Error("episode is required");
  }
  if (!episode.id || !episode.runId) {
    throw new Error("episode.id and episode.runId are required");
  }
  if (!episode.evidenceHash) {
    throw new Error("episode.evidenceHash is required");
  }
}

function safeRequire<T>(moduleName: string): T | null {
  try {
    return requireModule(moduleName) as T;
  } catch {
    return null;
  }
}
