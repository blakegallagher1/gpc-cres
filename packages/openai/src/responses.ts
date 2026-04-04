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
  safetyIdentifier?: string | null;
};

const OPENAI_CLIENT_MAX_RETRIES = 0;
const DEFAULT_RESPONSE_RETRIES = 2;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;
const DEFAULT_RETRY_MULTIPLIER = 2;
const DEFAULT_CRE_GOD_MODEL = "cre-god-model";

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

type CreGatewayConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function getCreGatewayConfig(): CreGatewayConfig | null {
  const rawBaseUrl = process.env.CRE_GOD_MODEL_BASE_URL?.trim();
  const apiKey = process.env.CRE_GOD_MODEL_API_KEY?.trim();
  if (!rawBaseUrl || !apiKey) {
    return null;
  }

  const normalizedBaseUrl = rawBaseUrl.startsWith("http")
    ? rawBaseUrl
    : `https://${rawBaseUrl}`;

  return {
    apiKey,
    baseUrl: normalizedBaseUrl.replace(/\/$/, ""),
    model: process.env.CRE_GOD_MODEL_NAME?.trim() || DEFAULT_CRE_GOD_MODEL,
  };
}

function getCreGatewayText(responseBody: unknown): { responseId: string | null; text: string } {
  if (!responseBody || typeof responseBody !== "object") {
    throw new Error("CRE gateway returned a non-object response");
  }

  const record = responseBody as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("CRE gateway response did not contain choices");
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new Error("CRE gateway response choice was invalid");
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== "object") {
    throw new Error("CRE gateway response did not contain a message");
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("CRE gateway response did not contain message content");
  }

  const responseId = typeof record.id === "string" && record.id.length > 0 ? record.id : null;
  return { responseId, text: content.trim() };
}

async function createCreGatewayTextResponse(
  params: CreateTextResponseParams,
  config: CreGatewayConfig,
  model: string,
): Promise<{ text: string; responseId: string | null }> {
  const payload = {
    model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    temperature: params.temperature,
    max_tokens: params.maxOutputTokens,
    top_p: params.topP,
  };

  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`CRE gateway request failed (${response.status}): ${detail}`);
  }

  return getCreGatewayText(await response.json());
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
  const responseRecord = asRecord(response) ?? {};
  const usage = extractUsageMetadata(response);
  const toolOutputSummary = summarizeToolOutput(response);
  const incompleteDetails = asRecord((response as { incomplete_details?: unknown }).incomplete_details);
  const finishReason = typeof incompleteDetails?.reason === "string"
    ? incompleteDetails.reason
    : undefined;
  const serviceTier = typeof responseRecord.service_tier === "string"
    ? responseRecord.service_tier
    : typeof responseRecord.serviceTier === "string"
      ? responseRecord.serviceTier
      : undefined;
  const promptCacheKey = typeof responseRecord.prompt_cache_key === "string"
    ? responseRecord.prompt_cache_key
    : typeof responseRecord.promptCacheKey === "string"
      ? responseRecord.promptCacheKey
      : undefined;
  const temperature = typeof responseRecord.temperature === "number" && Number.isFinite(responseRecord.temperature)
    ? responseRecord.temperature
    : undefined;
  const topP = typeof responseRecord.top_p === "number" && Number.isFinite(responseRecord.top_p)
    ? responseRecord.top_p
    : typeof responseRecord.topP === "number" && Number.isFinite(responseRecord.topP)
      ? responseRecord.topP
      : undefined;
  const parallelToolCalls = typeof responseRecord.parallel_tool_calls === "boolean"
    ? responseRecord.parallel_tool_calls
    : typeof responseRecord.parallelToolCalls === "boolean"
      ? responseRecord.parallelToolCalls
      : undefined;
  const background = typeof responseRecord.background === "boolean"
    ? responseRecord.background
    : undefined;
  const safetyIdentifier = typeof responseRecord.safety_identifier === "string"
    ? responseRecord.safety_identifier
    : typeof responseRecord.safetyIdentifier === "string"
      ? responseRecord.safetyIdentifier
      : undefined;
  const maxToolCalls = typeof responseRecord.max_tool_calls === "number" &&
    Number.isFinite(responseRecord.max_tool_calls)
    ? Math.floor(responseRecord.max_tool_calls)
    : typeof responseRecord.maxToolCalls === "number" &&
        Number.isFinite(responseRecord.maxToolCalls)
      ? Math.floor(responseRecord.maxToolCalls)
      : undefined;

  const createdAtRaw = typeof responseRecord.created_at === "number"
    ? responseRecord.created_at
    : typeof responseRecord.createdAt === "number"
      ? responseRecord.createdAt
      : null;
  const completedAtRaw = typeof responseRecord.completed_at === "number"
    ? responseRecord.completed_at
    : typeof responseRecord.completedAt === "number"
      ? responseRecord.completedAt
      : null;
  const createdAtEpoch = typeof createdAtRaw === "number"
    ? createdAtRaw > 1_000_000_000_000 ? Math.floor(createdAtRaw / 1_000) : Math.floor(createdAtRaw)
    : undefined;
  const completedAtEpoch = typeof completedAtRaw === "number"
    ? completedAtRaw > 1_000_000_000_000 ? Math.floor(completedAtRaw / 1_000) : Math.floor(completedAtRaw)
    : undefined;
  const createdAt = typeof createdAtEpoch === "number"
    ? new Date(createdAtEpoch * 1_000).toISOString()
    : typeof responseRecord.created_at === "string"
      ? responseRecord.created_at
      : typeof responseRecord.createdAt === "string"
        ? responseRecord.createdAt
        : undefined;
  const completedAt = typeof completedAtEpoch === "number"
    ? new Date(completedAtEpoch * 1_000).toISOString()
    : typeof responseRecord.completed_at === "string"
      ? responseRecord.completed_at
      : typeof responseRecord.completedAt === "string"
        ? responseRecord.completedAt
        : undefined;

  if (
    !response.model &&
    !response.status &&
    !serviceTier &&
    !promptCacheKey &&
    typeof parallelToolCalls !== "boolean" &&
    typeof background !== "boolean" &&
    typeof temperature !== "number" &&
    typeof topP !== "number" &&
    !safetyIdentifier &&
    typeof maxToolCalls !== "number" &&
    !createdAt &&
    !completedAt &&
    typeof createdAtEpoch !== "number" &&
    typeof completedAtEpoch !== "number" &&
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
    ...(serviceTier ? { serviceTier } : {}),
    ...(promptCacheKey ? { promptCacheKey } : {}),
    ...(typeof parallelToolCalls === "boolean" ? { parallelToolCalls } : {}),
    ...(typeof background === "boolean" ? { background } : {}),
    ...(typeof temperature === "number" ? { temperature } : {}),
    ...(typeof topP === "number" ? { topP } : {}),
    ...(safetyIdentifier ? { safetyIdentifier } : {}),
    ...(typeof maxToolCalls === "number" ? { maxToolCalls } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(typeof createdAtEpoch === "number" ? { createdAtEpoch } : {}),
    ...(typeof completedAtEpoch === "number" ? { completedAtEpoch } : {}),
    raw: {
      id: typeof responseRecord.id === "string" ? responseRecord.id : undefined,
      model: typeof response.model === "string" ? response.model : undefined,
      status: typeof response.status === "string" ? response.status : undefined,
      serviceTier,
      promptCacheKey,
      parallelToolCalls,
      temperature,
      topP,
      background,
      safetyIdentifier,
      maxToolCalls,
      createdAt,
      completedAt,
      createdAtEpoch,
      completedAtEpoch,
    },
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
          const sourceRecord = asRecord(source);
          if (!sourceRecord) {
            continue;
          }
          const url = typeof sourceRecord.url === "string" ? sourceRecord.url : null;
          if (!url) continue;

          const title = typeof sourceRecord.title === "string" ? sourceRecord.title : undefined;
          const snippet = typeof sourceRecord.snippet === "string"
            ? sourceRecord.snippet
            : typeof sourceRecord.summary === "string"
              ? sourceRecord.summary
              : undefined;

          webSearchSources.push({
            url,
            title,
            snippet,
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
  safetyIdentifier?: string | null;
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
    ...(options.safetyIdentifier
      ? { safety_identifier: options.safetyIdentifier }
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
  safetyIdentifier?: string | null;
};

/**
 * Generate plain text via the Responses API.
 * Use for narratives, summaries, and briefing text where structured JSON is not needed.
 */
export async function createTextResponse(
  params: CreateTextResponseParams,
): Promise<{ text: string; responseId: string | null }> {
  const creGatewayConfig = getCreGatewayConfig();
  const model = params.model ?? (creGatewayConfig?.model ?? "gpt-5.4-mini");

  if (creGatewayConfig && model === creGatewayConfig.model) {
    return withExponentialBackoff(
      async () => createCreGatewayTextResponse(params, creGatewayConfig, model),
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
    );
  }

  const client = getClient(params.apiKey);

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
            params.promptCacheKey !== undefined ? params.promptCacheKey : "entitlement-os",
          promptCacheRetention: params.promptCacheRetention ?? "24h",
          safetyIdentifier: params.safetyIdentifier ?? undefined,
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
        promptCacheRetention: params.promptCacheRetention ?? "24h",
        safetyIdentifier: params.safetyIdentifier ?? undefined,
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
