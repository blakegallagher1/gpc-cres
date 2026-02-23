import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";

const DEPTH_SENTINEL = "[truncated:depth]";
const ARRAY_SENTINEL = "[truncated:array_items]";
const OBJECT_SENTINEL = "[truncated:object_keys]";
const STRING_SENTINEL = "…[truncated]";
const SERIALIZED_SENTINEL = "[truncated:serialized_length]";

export type ToolOutputTrimmerOptions = {
  maxDepth: number;
  maxObjectKeys: number;
  maxArrayItems: number;
  maxStringLength: number;
  maxSerializedLength: number;
};

export type ToolOutputTrimResult = {
  value: unknown;
  trimmed: boolean;
  originalSerializedLength: number;
  trimmedSerializedLength: number;
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function trimString(value: string, maxStringLength: number): { value: string; trimmed: boolean } {
  if (value.length <= maxStringLength) {
    return { value, trimmed: false };
  }
  const suffix = STRING_SENTINEL;
  const available = Math.max(0, maxStringLength - suffix.length);
  return {
    value: `${value.slice(0, available)}${suffix}`,
    trimmed: true,
  };
}

function trimNode(
  value: unknown,
  options: ToolOutputTrimmerOptions,
  depth: number,
): { value: unknown; trimmed: boolean } {
  if (value === null || value === undefined) {
    return { value, trimmed: false };
  }

  if (typeof value === "string") {
    return trimString(value, options.maxStringLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return { value, trimmed: false };
  }

  if (typeof value === "bigint") {
    return { value: value.toString(), trimmed: true };
  }

  if (typeof value === "function") {
    return { value: "[function]", trimmed: true };
  }

  if (depth >= options.maxDepth) {
    return { value: DEPTH_SENTINEL, trimmed: true };
  }

  if (Array.isArray(value)) {
    const next = value.slice(0, options.maxArrayItems);
    const out: unknown[] = [];
    let trimmed = value.length > options.maxArrayItems;
    for (const item of next) {
      const nested = trimNode(item, options, depth + 1);
      out.push(nested.value);
      trimmed ||= nested.trimmed;
    }
    if (value.length > options.maxArrayItems) {
      out.push(ARRAY_SENTINEL);
    }
    return { value: out, trimmed };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const kept = entries.slice(0, options.maxObjectKeys);
    const output: Record<string, unknown> = {};
    let trimmed = entries.length > options.maxObjectKeys;

    for (const [key, nestedValue] of kept) {
      const nested = trimNode(nestedValue, options, depth + 1);
      output[key] = nested.value;
      trimmed ||= nested.trimmed;
    }

    if (entries.length > options.maxObjectKeys) {
      output.__truncated__ = OBJECT_SENTINEL;
    }
    return { value: output, trimmed };
  }

  return { value: String(value), trimmed: true };
}

function trimToSerializedLength(
  value: unknown,
  options: ToolOutputTrimmerOptions,
): { value: unknown; trimmed: boolean } {
  const serialized = safeStringify(value);
  if (serialized.length <= options.maxSerializedLength) {
    return { value, trimmed: false };
  }

  const suffix = STRING_SENTINEL;
  const available = Math.max(0, options.maxSerializedLength - suffix.length);
  return {
    value: `${serialized.slice(0, available)}${suffix}${SERIALIZED_SENTINEL}`,
    trimmed: true,
  };
}

export function trimToolOutput(
  value: unknown,
  options: ToolOutputTrimmerOptions,
): ToolOutputTrimResult {
  const originalSerialized = safeStringify(value);
  const initial = trimNode(value, options, 0);
  const serializedTrim = trimToSerializedLength(initial.value, options);
  const finalValue = serializedTrim.value;
  const trimmedSerialized = safeStringify(finalValue);

  return {
    value: finalValue,
    trimmed: initial.trimmed || serializedTrim.trimmed,
    originalSerializedLength: originalSerialized.length,
    trimmedSerializedLength: trimmedSerialized.length,
  };
}

export function maybeTrimToolOutput(value: unknown): ToolOutputTrimResult {
  const config = getAgentOsConfig();
  const originalSerialized = safeStringify(value);

  if (!isAgentOsFeatureEnabled("toolOutputTrimming")) {
    return {
      value,
      trimmed: false,
      originalSerializedLength: originalSerialized.length,
      trimmedSerializedLength: originalSerialized.length,
    };
  }

  return trimToolOutput(value, config.toolOutputTrimmer);
}

// ---------------------------------------------------------------------------
// Per-tool token-budget trimming (Phase 1 addition)
// ---------------------------------------------------------------------------

const PER_TOOL_MAX_TOKENS: Record<string, number> = {
  parcel_search: 4096,
  screen_parcels: 4096,
  get_deal_summary: 2048,
  search_parcels: 4096,
  get_parcel_details: 3072,
};

const DEFAULT_MAX_TOKENS = 2048;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function isLikelyJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isLikelyCsv(text: string): boolean {
  const lines = text.split("\n", 4);
  if (lines.length < 2) return false;
  const commaCount = (lines[0].match(/,/g) ?? []).length;
  return commaCount >= 2 && lines.slice(1).every((l) => (l.match(/,/g) ?? []).length >= commaCount - 1);
}

function truncateJsonString(text: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      const keepFront = Math.max(1, Math.floor(parsed.length * 0.3));
      const keepBack = Math.max(1, Math.floor(parsed.length * 0.1));
      if (parsed.length > keepFront + keepBack + 1) {
        const omitted = parsed.length - keepFront - keepBack;
        const trimmed = [
          ...parsed.slice(0, keepFront),
          `... ${omitted} items omitted ...`,
          ...parsed.slice(-keepBack),
        ];
        const result = JSON.stringify(trimmed, null, 2);
        if (result.length <= maxChars) return result;
      }
    }
    if (typeof parsed === "object" && parsed !== null) {
      const shortened = truncateObjectValues(parsed as Record<string, unknown>, maxChars);
      return JSON.stringify(shortened, null, 2);
    }
  } catch {
    /* not valid JSON, fall through */
  }
  return text.slice(0, maxChars);
}

function truncateObjectValues(obj: Record<string, unknown>, budget: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const stringBudget = Math.floor(budget / (Object.keys(obj).length || 1) / CHARS_PER_TOKEN);
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.length > stringBudget) {
      result[key] = value.slice(0, stringBudget) + "…[truncated]";
    } else if (Array.isArray(value) && value.length > 10) {
      result[key] = [...value.slice(0, 5), `... ${value.length - 7} items omitted ...`, ...value.slice(-2)];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function truncateCsvString(text: string, maxChars: number): string {
  const lines = text.split("\n");
  if (lines.length <= 3) return text.slice(0, maxChars);
  const header = lines[0];
  const keepFront = Math.max(1, Math.min(5, Math.floor(lines.length * 0.3)));
  const keepBack = Math.max(1, Math.min(3, Math.floor(lines.length * 0.1)));
  const omitted = lines.length - 1 - keepFront - keepBack;
  if (omitted <= 0) return text.slice(0, maxChars);
  return [
    header,
    ...lines.slice(1, 1 + keepFront),
    `... ${omitted} rows omitted ...`,
    ...lines.slice(-keepBack),
  ].join("\n").slice(0, maxChars);
}

function truncateGenericString(text: string, maxChars: number): string {
  const front = Math.floor(maxChars * 0.6);
  const back = Math.floor(maxChars * 0.2);
  return `${text.slice(0, front)}\n[...truncated ${text.length - front - back} chars...]\n${text.slice(-back)}`;
}

/**
 * Trim a tool's string output to fit within the per-tool token budget.
 * Uses format-aware truncation (JSON arrays, CSV rows, generic text).
 */
export function trimToolOutputForTool(output: string, toolName: string): string {
  if (!isAgentOsFeatureEnabled("toolOutputTrimming")) return output;

  const maxTokens = PER_TOOL_MAX_TOKENS[toolName] ?? DEFAULT_MAX_TOKENS;
  if (estimateTokens(output) <= maxTokens) return output;

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (isLikelyJson(output)) return truncateJsonString(output, maxChars);
  if (isLikelyCsv(output)) return truncateCsvString(output, maxChars);
  return truncateGenericString(output, maxChars);
}

