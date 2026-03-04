type JsonRecord = Record<string, unknown>;

export type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  estimatedCostUsd: number | null;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) return null;
  return Math.floor(value);
}

function readRateEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function extractUsageObject(value: unknown): JsonRecord | null {
  const direct = asRecord(value);
  if (!direct) return null;

  const directKeys = [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "prompt_tokens",
    "completion_tokens",
  ];
  if (directKeys.some((key) => key in direct)) {
    return direct;
  }

  const nestedCandidates = [
    direct.usage,
    direct.token_usage,
    direct.response_usage,
    direct.lastResponse,
    direct.finalResponse,
  ];

  for (const candidate of nestedCandidates) {
    const nested = asRecord(candidate);
    if (!nested) continue;
    if (directKeys.some((key) => key in nested)) {
      return nested;
    }
    const nestedUsage = asRecord(nested.usage);
    if (nestedUsage && directKeys.some((key) => key in nestedUsage)) {
      return nestedUsage;
    }
  }

  return null;
}

function estimateCost(inputTokens: number, outputTokens: number): number | null {
  const inputRate = readRateEnv("AGENTOS_INPUT_COST_PER_1M_TOKENS_USD");
  const outputRate = readRateEnv("AGENTOS_OUTPUT_COST_PER_1M_TOKENS_USD");
  if (inputRate === null || outputRate === null) {
    return null;
  }
  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;
  return Number((inputCost + outputCost).toFixed(6));
}

export function extractUsageSummary(value: unknown): UsageSummary | null {
  const usage = extractUsageObject(value);
  if (!usage) return null;

  const inputTokens =
    asNonNegativeInt(usage.input_tokens) ??
    asNonNegativeInt(usage.prompt_tokens) ??
    0;
  const outputTokens =
    asNonNegativeInt(usage.output_tokens) ??
    asNonNegativeInt(usage.completion_tokens) ??
    0;
  const totalTokens =
    asNonNegativeInt(usage.total_tokens) ?? inputTokens + outputTokens;

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return null;
  }

  const inputDetails = asRecord(usage.input_tokens_details) ?? asRecord(usage.prompt_tokens_details);
  const cachedInputTokens = asNonNegativeInt(inputDetails?.cached_tokens) ?? 0;

  if (cachedInputTokens > 0) {
    console.log(
      `[prompt-cache] ${cachedInputTokens}/${inputTokens} input tokens served from cache (${Math.round((cachedInputTokens / inputTokens) * 100)}%)`,
    );
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    estimatedCostUsd: estimateCost(inputTokens, outputTokens),
  };
}

