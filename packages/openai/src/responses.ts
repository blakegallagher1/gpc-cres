import OpenAI from "openai";

import type { OpenAiJsonSchema } from "@entitlement-os/shared";

import { retryWithBackoff } from "./retry.js";
import type { OpenAiToolSources, OpenAiWebSearchSource, StrictJsonResponse } from "./types.js";

export type CreateStrictJsonResponseParams = {
  apiKey?: string;
  model: string;
  input: OpenAI.Responses.ResponseCreateParams["input"];
  jsonSchema: OpenAiJsonSchema;
  tools?: OpenAI.Responses.ResponseCreateParams["tools"];
  reasoning?: OpenAI.Responses.ResponseCreateParams["reasoning"];
};

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return new OpenAI({ apiKey: key });
}

function getOutputText(response: unknown): string {
  const anyResp = response as { output_text?: string; output?: unknown[] };
  if (typeof anyResp.output_text === "string" && anyResp.output_text.trim().length > 0) {
    return anyResp.output_text;
  }

  const out = Array.isArray(anyResp.output) ? anyResp.output : [];
  const chunks: string[] = [];
  for (const item of out) {
    const anyItem = item as { type?: string; content?: unknown[] };
    if (anyItem.type !== "output_text") continue;
    const content = Array.isArray(anyItem.content) ? anyItem.content : [];
    for (const c of content) {
      const anyC = c as { type?: string; text?: string };
      if (anyC.type === "output_text" && typeof anyC.text === "string") chunks.push(anyC.text);
      if (anyC.type === "text" && typeof anyC.text === "string") chunks.push(anyC.text);
    }
  }

  const joined = chunks.join("").trim();
  if (!joined) {
    throw new Error("OpenAI response did not contain output text");
  }
  return joined;
}

function parseStrictJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse OpenAI JSON output: ${message}`);
  }
}

function extractToolSources(response: unknown): OpenAiToolSources {
  const out = (response as { output?: unknown[] }).output;
  const output = Array.isArray(out) ? out : [];

  const webSearchSources: OpenAiWebSearchSource[] = [];
  const fileSearchResults: unknown[] = [];

  for (const item of output) {
    const anyItem = item as { type?: string; action?: { sources?: unknown[] }; results?: unknown[] };

    if (anyItem.type === "web_search_call") {
      const sources = anyItem.action?.sources;
      if (Array.isArray(sources)) {
        for (const s of sources) {
          const anyS = s as { url?: string; title?: string; snippet?: string; text?: string };
          if (typeof anyS.url === "string") {
            webSearchSources.push({
              url: anyS.url,
              title: typeof anyS.title === "string" ? anyS.title : undefined,
              snippet:
                typeof anyS.snippet === "string"
                  ? anyS.snippet
                  : typeof anyS.text === "string"
                    ? anyS.text
                    : undefined,
            });
          }
        }
      }
    }

    if (anyItem.type === "file_search_call") {
      const results = anyItem.results;
      if (Array.isArray(results)) fileSearchResults.push(...results);
    }
  }

  return {
    webSearchSources,
    fileSearchResults,
  };
}

export async function createStrictJsonResponse<T>(
  params: CreateStrictJsonResponseParams,
): Promise<StrictJsonResponse<T>> {
  const client = getClient(params.apiKey);

  // The OpenAI Node SDK's `ResponseIncludable` type can lag behind the API.
  // We rely on include for auditability (tool-provided sources).
  const include = ["web_search_call.action.sources", "file_search_call.results"] as const;

  const response = await retryWithBackoff(async () => {
    return await client.responses.create({
      model: params.model,
      input: params.input,
      text: {
        format: {
          type: "json_schema",
          name: params.jsonSchema.name,
          schema: params.jsonSchema.schema,
          strict: true,
        },
      },
      reasoning: params.reasoning,
      tools: params.tools,
      store: false,
      include: include as unknown as OpenAI.Responses.ResponseIncludable[],
    });
  });

  const outputText = getOutputText(response);
  const outputJson = parseStrictJson(outputText) as T;

  return {
    responseId: typeof response.id === "string" ? response.id : null,
    outputJson,
    toolSources: extractToolSources(response),
  };
}
