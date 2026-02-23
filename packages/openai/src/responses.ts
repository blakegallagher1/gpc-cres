import OpenAI from "openai";

import type { OpenAiJsonSchema } from "@entitlement-os/shared";

import type { OpenAiToolSources, OpenAiWebSearchSource, StrictJsonResponse } from "./types.js";
import { withExponentialBackoff } from "./utils/retry.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "./agentos/config.js";
import { buildResponseContinuationParams } from "./agentos/sessionManager.js";

export type CreateStrictJsonResponseParams = {
  apiKey?: string;
  model: string;
  input: OpenAI.Responses.ResponseCreateParams["input"];
  jsonSchema: OpenAiJsonSchema;
  tools?: OpenAI.Responses.ResponseCreateParams["tools"];
  reasoning?: OpenAI.Responses.ResponseCreateParams["reasoning"];
  previousResponseId?: string | null;
  contextManagement?: {
    strategy: "compaction";
  } | null;
};

const OPENAI_CLIENT_MAX_RETRIES = 0;
const DEFAULT_RESPONSE_RETRIES = 2;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;
const DEFAULT_RETRY_MULTIPLIER = 2;

let cachedClient: OpenAI | null = null;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required");
  }

  if (apiKey) {
    return new OpenAI({ apiKey: key, maxRetries: OPENAI_CLIENT_MAX_RETRIES });
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: key, maxRetries: OPENAI_CLIENT_MAX_RETRIES });
  }

  return cachedClient;
}

function getOutputText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  throw new Error("OpenAI response did not contain output text");
}

function parseStrictJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse OpenAI JSON output: ${message}`);
  }
}

function extractToolSources(response: OpenAI.Responses.Response): OpenAiToolSources {
  const output = Array.isArray(response.output) ? response.output : [];

  const webSearchSources: OpenAiWebSearchSource[] = [];
  const fileSearchResults: unknown[] = [];

  for (const item of output) {
    if (item.type === "web_search_call") {
      const sources =
        item.action &&
        "sources" in item.action &&
        Array.isArray(item.action.sources)
          ? item.action.sources
          : null;
      if (sources) {
        for (const source of sources) {
          if (typeof source.url !== "string") {
            continue;
          }

          webSearchSources.push({
            url: source.url,
            title: undefined,
            snippet: undefined,
          });
        }
      }
    }

    if (item.type === "file_search_call" && Array.isArray(item.results)) {
      fileSearchResults.push(...item.results);
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
  const config = getAgentOsConfig();

  const include: OpenAI.Responses.ResponseIncludable[] = [
    "web_search_call.action.sources",
    "file_search_call.results",
  ];

  const continuation = buildResponseContinuationParams(params.previousResponseId ?? null);
  const contextManagement =
    params.contextManagement ??
    (isAgentOsFeatureEnabled("contextManagementCompaction")
      ? continuation.context_management ?? { strategy: config.contextManagement.strategy }
      : undefined);

  const reasoning =
    params.reasoning ??
    (config.enabled
      ? ({
          effort: config.models.reasoningEffort,
        } as OpenAI.Responses.ResponseCreateParams["reasoning"])
      : undefined);

  const response = (await withExponentialBackoff(
    async () => {
      const requestBody: Record<string, unknown> = {
        model: params.model,
        input: params.input,
        stream: false,
        text: {
          format: {
            type: "json_schema",
            name: params.jsonSchema.name,
            schema: params.jsonSchema.schema,
            strict: true,
          },
        },
        reasoning,
        tools: params.tools,
        store: false,
        include,
        ...continuation,
      };

      if (contextManagement) {
        requestBody.context_management = contextManagement;
      }

      return client.responses.create(
        requestBody as OpenAI.Responses.ResponseCreateParams,
      );
    },
    {
      retries: envNumber("OPENAI_RESPONSES_RETRIES", DEFAULT_RESPONSE_RETRIES),
      initialDelayMs: envNumber(
        "OPENAI_RESPONSES_INITIAL_RETRY_DELAY_MS",
        DEFAULT_INITIAL_RETRY_DELAY_MS,
      ),
      maxDelayMs: envNumber(
        "OPENAI_RESPONSES_MAX_RETRY_DELAY_MS",
        DEFAULT_MAX_RETRY_DELAY_MS,
      ),
      multiplier: envNumber(
        "OPENAI_RESPONSES_RETRY_MULTIPLIER",
        DEFAULT_RETRY_MULTIPLIER,
      ),
    },
  )) as OpenAI.Responses.Response;

  const outputText = getOutputText(response);
  const outputJson = parseStrictJson(outputText) as T;

  return {
    responseId: typeof response.id === "string" ? response.id : null,
    outputJson,
    toolSources: extractToolSources(response),
  };
}
