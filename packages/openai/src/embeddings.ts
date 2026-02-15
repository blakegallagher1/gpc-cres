/**
 * OpenAI embedding utility used by Data Agent retrieval and reflection helpers.
 */

import OpenAI from "openai";

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export type EmbeddingInput = string | readonly string[];

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return apiKey;
}

export async function createEmbedding(input: EmbeddingInput, model = OPENAI_EMBEDDING_MODEL): Promise<number[]> {
  const normalized = typeof input === "string" ? input.trim() : input;
  const prompt = Array.isArray(normalized)
    ? normalized.map((value) => value.trim()).filter(Boolean)
    : typeof normalized === "string"
      ? normalized
      : "";

  if (Array.isArray(prompt)) {
    if (prompt.length === 0) {
      throw new Error("Embedding input cannot be empty");
    }
  } else if (!prompt) {
    throw new Error("Embedding input cannot be empty");
  }

  const client = new OpenAI({ apiKey: getApiKey() });
  const response = await client.embeddings.create({
    model,
    input: prompt,
    encoding_format: "float",
  });

  if (!Array.isArray(response?.data) || response.data.length === 0) {
    throw new Error("OpenAI embeddings response missing data");
  }

  const embedding = response.data[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("OpenAI embeddings response missing embedding");
  }

  return embedding;
}
