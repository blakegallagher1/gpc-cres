import type { MapFeature } from "./mapActionTypes";

/**
 * Marker field name embedded in tool result JSON.
 * executeAgent.ts scans for this after tool_end events.
 */
const MAP_FEATURES_KEY = "__mapFeatures";

/**
 * Wraps a tool's text result with structured map features.
 * The agent still sees the textResult as its tool output.
 * The __mapFeatures field is stripped before sending to the LLM
 * but consumed by executeAgent.ts for map_action emission.
 */
export function createToolResultWithMap(
  textResult: string,
  features: MapFeature[]
): string {
  if (features.length === 0) return textResult;

  return JSON.stringify({
    text: textResult,
    [MAP_FEATURES_KEY]: features,
  });
}

/**
 * Parse map features from a tool result (string or object).
 * Returns null if no map features present.
 */
export function parseToolResultMapFeatures(
  result: unknown
): MapFeature[] | null {
  if (!result) return null;

  let obj: Record<string, unknown>;
  if (typeof result === "string") {
    try {
      obj = JSON.parse(result);
    } catch {
      return null;
    }
  } else if (typeof result === "object") {
    obj = result as Record<string, unknown>;
  } else {
    return null;
  }

  const features = obj[MAP_FEATURES_KEY];
  if (!Array.isArray(features) || features.length === 0) return null;

  return features as MapFeature[];
}

/**
 * Extract the text portion from a wrapped tool result.
 * If the result isn't wrapped, returns it as-is.
 */
export function extractTextFromToolResult(result: unknown): string {
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (MAP_FEATURES_KEY in obj) {
      return typeof obj.text === "string" ? obj.text : JSON.stringify(obj.text);
    }
    return JSON.stringify(result);
  }

  if (typeof result !== "string") return String(result ?? "");

  try {
    const obj = JSON.parse(result);
    if (obj && typeof obj === "object" && MAP_FEATURES_KEY in obj) {
      return typeof obj.text === "string" ? obj.text : JSON.stringify(obj.text);
    }
  } catch {
    // Not JSON — return raw string
  }
  return result;
}
