import OpenAI from "openai";

import type { OpenAiJsonSchema } from "@entitlement-os/shared";

import type {
  OpenAiResponseMetadata,
  OpenAiToolOutputSummary,
  OpenAiToolSources,
  OpenAiUsageSummary,
  OpenAiWebSearchSource,
  StrictJsonResponse,
} from "./types.js";
import { withExponentialBackoff } from "./utils/retry.js";
import { getAgentOsConfig } from "./agentos/config.js";
import { buildResponseContinuationParams } from "./agentos/sessionManager.js";

export type CompactionControl =
  | {
      enabled: false;
    }
  | {
      strategy: "manual";
    };

export type CreateStrictJsonResponseParams = {
  apiKey?: string;
  model: string;
  input: OpenAI.Responses.ResponseCreateParams["input"];
  jsonSchema: OpenAiJsonSchema;
  tools?: OpenAI.Responses.ResponseCreateParams["tools"];
  reasoning?: OpenAI.Responses.ResponseCreateParams["reasoning"] | null;
  toolChoice?: OpenAI.Responses.ResponseCreateParams["tool_choice"];
  parallelToolCalls?: OpenAI.Responses.ResponseCreateParams["parallel_tool_calls"];
  contextManagement?: OpenAI.Responses.ResponseCreateParams["context_management"] | null;
  compaction?: CompactionControl;
  truncation?: OpenAI.Responses.ResponseCreateParams["truncation"];
  previousResponseId?: string | null;
  store?: boolean;
  promptCacheKey?: string | null;
  promptCacheRetention?: OpenAI.Responses.ResponseCreateParams["prompt_cache_retention"];
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 ? Math.floor(value) : null;
}

function hasUsageTokens(candidate: Record<string, unknown>): boolean {
  return [
    "input_tokens",
    "prompt_tokens",
    "output_tokens",
    "completion_tokens",
    "total_tokens",
  ].some((key) => key in candidate);
}

function readUsageRecord(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (!direct) return null;
  if (hasUsageTokens(direct)) return direct;

  const nestedCandidates: unknown[] = [
    direct.usage,
    direct.token_usage,
    direct.response_usage,
    direct.lastResponse,
    direct.finalResponse,
  ];

  for (const candidate of nestedCandidates) {
    const nested = asRecord(candidate);
    if (!nested) continue;
    if (hasUsageTokens(nested)) return nested;
    const nestedUsage = asRecord(nested.usage);
    if (nestedUsage && hasUsageTokens(nestedUsage)) return nestedUsage;
  }

  return null;
}

function readUsageTokens(value: Record<string, unknown>): OpenAiUsageSummary | null {
  const inputTokens = asNonNegativeInt(value.input_tokens) ?? asNonNegativeInt(value.prompt_tokens);
  const outputTokens = asNonNegativeInt(value.output_tokens) ?? asNonNegativeInt(value.completion_tokens);
  const totalTokens = asNonNegativeInt(value.total_tokens) ?? (
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
  );
  if (
    inputTokens === null &&
    outputTokens === null &&
    totalTokens === null &&
    asNonNegativeInt(value.cached_tokens) === null &&
    asNonNegativeInt(
      asRecord(value.input_tokens_details)?.cached_tokens,
    ) === null &&
    asNonNegativeInt(
      asRecord(value.prompt_tokens_details)?.cached_tokens,
    ) === null
  ) {
    return null;
  }

  const inputTokenDetails = asRecord(value.input_tokens_details) ?? asRecord(value.prompt_tokens_details);
  const cachedInputTokens = asNonNegativeInt(inputTokenDetails?.cached_tokens);

  return {
    inputTokens: inputTokens ?? undefined,
    promptTokens: asNonNegativeInt(value.prompt_tokens) ?? undefined,
    outputTokens: outputTokens ?? undefined,
    completionTokens: asNonNegativeInt(value.completion_tokens) ?? undefined,
    totalTokens: totalTokens ?? undefined,
    cachedInputTokens: cachedInputTokens ?? undefined,
    raw: value,
  };
}

function extractUsageMetadata(response: OpenAI.Responses.Response): OpenAiUsageSummary | null {
  const usageRecord = readUsageRecord(response.usage);
  if (!usageRecord) {
    return null;
  }
  return readUsageTokens(usageRecord);
}

function summarizeToolOutput(response: OpenAI.Responses.Response): OpenAiToolOutputSummary {
  const output = Array.isArray(response.output) ? response.output : [];
  const summary: OpenAiToolOutputSummary = {
    totalToolCalls: 0,
    totalToolOutputs: 0,
    failedToolOutputs: 0,
    callsByType: {},
    outputsByType: {},
  };

  const countFailureInChunk = (chunk: unknown): boolean => {
    const chunkRecord = asRecord(chunk);
    if (!chunkRecord) return false;

    const status = chunkRecord.status;
    if (typeof status === "string") {
      const normalized = status.toLowerCase();
      if (normalized === "error" || normalized === "failed" || normalized === "timed_out") {
        return true;
      }
    }

    const outcome = asRecord(chunkRecord.outcome);
    if (!outcome) return false;

    const outcomeType = outcome.type;
    if (typeof outcomeType === "string") {
      const normalizedOutcome = outcomeType.toLowerCase();
      if (
        normalizedOutcome === "error" ||
        normalizedOutcome === "timeout"
      ) {
        return true;
      }
      if (
        normalizedOutcome === "exit" &&
        typeof outcome.exit_code === "number" &&
        outcome.exit_code !== 0
      ) {
        return true;
      }
    }

    return false;
  };

  const isFailedOutputItem = (itemRecord: Record<string, unknown>): boolean => {
    if (countFailureInChunk(itemRecord)) return true;

    if (Array.isArray(itemRecord.output)) {
      for (const chunk of itemRecord.output) {
        if (countFailureInChunk(chunk)) {
          return true;
        }
      }
    }

    const itemOutput = asRecord(itemRecord.output);
    const chunkCandidates = itemOutput
      ? [
          itemOutput.chunk_output,
          itemOutput.result,
          itemOutput.output_chunks,
        ]
      : [];
    for (const candidate of chunkCandidates) {
      if (Array.isArray(candidate)) {
        for (const chunk of candidate) {
          if (countFailureInChunk(chunk)) return true;
        }
      }
    }

    const directOutput = itemRecord.output;
    if (directOutput && Array.isArray((directOutput as Record<string, unknown>).chunks)) {
      const chunks = (directOutput as Record<string, unknown>).chunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (countFailureInChunk(chunk)) return true;
        }
      }
    }

    if (Array.isArray(itemRecord.output_chunks)) {
      for (const chunk of itemRecord.output_chunks) {
        if (countFailureInChunk(chunk)) return true;
      }
    }

    return false;
  };

  for (const item of output) {
    const itemRecord = asRecord(item);
    if (!itemRecord) continue;

    const typeValue = itemRecord.type;
    if (typeof typeValue !== "string" || typeValue.length === 0) continue;
    const type = typeValue.toLowerCase();

    if (type.endsWith("_call") && !type.endsWith("_call_output")) {
      summary.totalToolCalls += 1;
      summary.callsByType[typeValue] = (summary.callsByType[typeValue] ?? 0) + 1;
      continue;
    }

    if (type.endsWith("_call_output")) {
      summary.totalToolOutputs += 1;
      summary.outputsByType[typeValue] = (summary.outputsByType[typeValue] ?? 0) + 1;
      if (isFailedOutputItem(itemRecord)) {
        summary.failedToolOutputs += 1;
      }
    }
  }

  return summary;
}

function extractResponseMetadata(response: OpenAI.Responses.Response): OpenAiResponseMetadata | null {
  const usage = extractUsageMetadata(response);
  const toolOutputSummary = summarizeToolOutput(response);
  const incompleteDetails = asRecord((response as { incomplete_details?: unknown }).incomplete_details);
  const finishReason = typeof incompleteDetails?.reason === "string"
    ? incompleteDetails.reason
    : undefined;

  if (
    !response.model &&
    !response.status &&
    !usage &&
    toolOutputSummary.totalToolCalls === 0 &&
    toolOutputSummary.totalToolOutputs === 0 &&
    toolOutputSummary.failedToolOutputs === 0
  ) {
    return null;
  }

  const metadata: OpenAiResponseMetadata = {
    toolOutputSummary,
    ...(usage ? { usage } : {}),
    ...(typeof response.model === "string" ? { model: response.model } : {}),
    ...(typeof response.status === "string" ? { status: response.status } : {}),
    ...(finishReason ? { finishReason } : {}),
  };

  return metadata;
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

export type ResponseCreateBaseParams = {
  model: string;
  input: OpenAI.Responses.ResponseCreateParams["input"];
  stream?: boolean;
  tools?: OpenAI.Responses.ResponseCreateParams["tools"];
  toolChoice?: OpenAI.Responses.ResponseCreateParams["tool_choice"];
  include?: OpenAI.Responses.ResponseCreateParams["include"];
  text?: OpenAI.Responses.ResponseCreateParams["text"];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoning?: OpenAI.Responses.ResponseCreateParams["reasoning"] | null;
  contextManagement?: OpenAI.Responses.ResponseCreateParams["context_management"] | null;
  compaction?: CompactionControl;
  truncation?: OpenAI.Responses.ResponseCreateParams["truncation"];
  previousResponseId?: string | null;
  store?: boolean;
  promptCacheKey?: string | null;
  promptCacheRetention?: OpenAI.Responses.ResponseCreateParams["prompt_cache_retention"];
  parallelToolCalls?: OpenAI.Responses.ResponseCreateParams["parallel_tool_calls"];
  applyDefaultReasoning?: boolean;
};

export function buildResponseCreateParams(
  options: ResponseCreateBaseParams,
): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  const config = getAgentOsConfig();
  const continuation = buildResponseContinuationParams(
    options.previousResponseId ?? null,
    options.contextManagement,
    options.compaction,
  );

  const reasoning =
    options.reasoning === null
      ? undefined
      : options.reasoning ??
        (options.applyDefaultReasoning && config.enabled
          ? ({
              effort: config.models.reasoningEffort,
            } as OpenAI.Responses.ResponseCreateParams["reasoning"])
          : undefined);

  return {
    model: options.model,
    input: options.input,
    stream: false,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    ...(options.include ? { include: options.include } : {}),
    ...(options.text ? { text: options.text } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(options.parallelToolCalls !== undefined
      ? { parallel_tool_calls: options.parallelToolCalls }
      : {}),
    ...(options.truncation ? { truncation: options.truncation } : {}),
    ...(options.maxOutputTokens !== undefined ? { max_output_tokens: options.maxOutputTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    ...(options.promptCacheKey !== null && options.promptCacheKey !== undefined
      ? { prompt_cache_key: options.promptCacheKey }
      : {}),
    ...(options.promptCacheRetention
      ? { prompt_cache_retention: options.promptCacheRetention }
      : {}),
    store: options.store ?? false,
    ...continuation,
  };
}

// ---------------------------------------------------------------------------
// Plain text generation (narratives, summaries, briefings)
// ---------------------------------------------------------------------------

export type CreateTextResponseParams = {
  apiKey?: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  reasoning?: OpenAI.Responses.ResponseCreateParams["reasoning"] | null;
  toolChoice?: OpenAI.Responses.ResponseCreateParams["tool_choice"];
  parallelToolCalls?: OpenAI.Responses.ResponseCreateParams["parallel_tool_calls"];
  contextManagement?: OpenAI.Responses.ResponseCreateParams["context_management"] | null;
  compaction?: CompactionControl;
  truncation?: OpenAI.Responses.ResponseCreateParams["truncation"];
  previousResponseId?: string | null;
  store?: boolean;
  promptCacheKey?: string | null;
  promptCacheRetention?: OpenAI.Responses.ResponseCreateParams["prompt_cache_retention"];
};

/**
 * Generate plain text via the Responses API.
 * Use for narratives, summaries, and briefing text where structured JSON is not needed.
 */
export async function createTextResponse(
  params: CreateTextResponseParams,
): Promise<{ text: string; responseId: string | null }> {
  const client = getClient(params.apiKey);
  const model = params.model ?? "gpt-4o-mini";

  const response = (await withExponentialBackoff(
    async () =>
      client.responses.create(
        buildResponseCreateParams({
          model,
          stream: false,
          input: [
            { role: "system" as const, content: params.systemPrompt },
            { role: "user" as const, content: params.userPrompt },
          ],
          maxOutputTokens: params.maxOutputTokens,
          topP: params.topP,
          temperature: params.temperature,
          reasoning: params.reasoning,
          toolChoice: params.toolChoice,
          parallelToolCalls: params.parallelToolCalls,
          contextManagement: params.contextManagement,
          compaction: params.compaction,
          truncation: params.truncation,
          previousResponseId: params.previousResponseId,
          store: params.store,
          promptCacheKey:
            params.promptCacheKey !== undefined ? params.promptCacheKey : undefined,
          promptCacheRetention: params.promptCacheRetention,
          applyDefaultReasoning: false,
        }),
      ),
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

  const text =
    typeof response.output_text === "string" ? response.output_text.trim() : "";

  return {
    text,
    responseId: typeof response.id === "string" ? response.id : null,
  };
}

// ---------------------------------------------------------------------------
// Strict JSON structured output
// ---------------------------------------------------------------------------

export async function createStrictJsonResponse<T>(
  params: CreateStrictJsonResponseParams,
): Promise<StrictJsonResponse<T>> {
  const client = getClient(params.apiKey);
  const config = getAgentOsConfig();

  const include: OpenAI.Responses.ResponseIncludable[] = [
    "web_search_call.action.sources",
    "file_search_call.results",
  ];

  const response = (await withExponentialBackoff(
    async () => {
      const requestBody: OpenAI.Responses.ResponseCreateParamsNonStreaming = buildResponseCreateParams({
        model: params.model,
        input: params.input,
        stream: false,
        promptCacheKey:
          params.promptCacheKey === undefined ? "entitlement-os" : params.promptCacheKey,
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
        toolChoice: params.toolChoice,
        parallelToolCalls: params.parallelToolCalls,
        truncation: params.truncation,
        store: params.store ?? false,
        contextManagement: params.contextManagement,
        compaction: params.compaction,
        previousResponseId: params.previousResponseId,
        promptCacheRetention: params.promptCacheRetention,
        include,
        applyDefaultReasoning: config.enabled,
      });

      return client.responses.create(
        requestBody,
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
  const metadata = extractResponseMetadata(response);

  return {
    responseId: typeof response.id === "string" ? response.id : null,
    outputJson,
    metadata: metadata ?? undefined,
    toolSources: extractToolSources(response),
  };
}
