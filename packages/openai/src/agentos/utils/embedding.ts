import OpenAI from "openai";

import { getAgentOsConfig } from "../config.js";
import { buildHashedSparseVector, type SparseVector } from "../qdrant.js";

const MAX_BATCH_SIZE = 2048;
const PERPLEXITY_MAX_BATCH_SIZE = 512;
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
 * Decode a Perplexity base64-encoded signed int8 embedding to a number array.
 * Perplexity returns embeddings as base64(int8[]) instead of float[].
 */
function decodePerplexityEmbedding(b64String: string): number[] {
  const buffer = Buffer.from(b64String, "base64");
  const int8Array = new Int8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return Array.from(int8Array);
}

async function embedTextsPerplexity(
  texts: string[],
  model: string,
): Promise<number[][]> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is required");

  const results: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += PERPLEXITY_MAX_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + PERPLEXITY_MAX_BATCH_SIZE);
    const cleanBatch = batch.map((t) => t.trim() || " ");

    const response = await withRetry(async () => {
      const res = await fetch("https://api.perplexity.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: cleanBatch }),
      });
      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Perplexity embeddings failed: ${res.status} ${text}`);
        (err as unknown as { status: number }).status = res.status;
        throw err;
      }
      return res.json() as Promise<{
        data: Array<{ index: number; embedding: string }>;
      }>;
    }, `embedTextsPerplexity batch offset=${offset} size=${cleanBatch.length}`);

    for (const item of response.data) {
      results[offset + item.index] = decodePerplexityEmbedding(item.embedding);
    }
  }

  return results;
}

/**
 * Batch-embed an array of texts. Uses Perplexity if PERPLEXITY_API_KEY is set,
 * otherwise falls back to OpenAI. Handles batching for large inputs.
 * Returns float arrays in the same order as input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const config = getAgentOsConfig();

  if (process.env.PERPLEXITY_API_KEY?.trim()) {
    return embedTextsPerplexity(texts, config.models.embedding);
  }

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
