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

