import OpenAI from "openai";

import { getAgentOsConfig } from "../config.js";
import { buildHashedSparseVector, type SparseVector } from "../qdrant.js";

const MAX_BATCH_SIZE = 2048;
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  return apiKey;
}

async function withRetry<T>(fn: () => Promise<T>, _label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit =
        err instanceof Error &&
        ("status" in err ? (err as { status: number }).status === 429 : false);
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
      if (attempt < MAX_RETRIES - 1 && (isRateLimit || attempt === 0)) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  throw lastError;
}

/**
 * Batch-embed an array of texts. Handles batching for >2048 inputs per call.
 * Returns float arrays in the same order as input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const config = getAgentOsConfig();
  const client = new OpenAI({ apiKey: getApiKey() });
  const results: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + MAX_BATCH_SIZE);
    const cleanBatch = batch.map((t) => t.trim() || " ");

    const response = await withRetry(
      () =>
        client.embeddings.create({
          model: config.models.embedding,
          input: cleanBatch,
          dimensions: config.models.embeddingDimensions,
          encoding_format: "float",
        }),
      `embedTexts batch offset=${offset} size=${cleanBatch.length}`,
    );

    for (let i = 0; i < response.data.length; i++) {
      results[offset + response.data[i].index] = response.data[i].embedding;
    }
  }

  return results;
}

/** Embed a single text. Convenience wrapper over embedTexts. */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

/**
 * Generate a BM25-style sparse vector for Qdrant.
 * Re-uses the hashed sparse vector builder from qdrant.ts.
 */
export function generateBM25Sparse(text: string): SparseVector {
  return buildHashedSparseVector(text);
}
