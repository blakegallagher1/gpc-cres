import type { MapActionPayload, MapFeature } from "./map-action-types.js";

const MAP_FEATURES_KEY = "__mapFeatures";
const MAP_ACTION_KEY = "__mapAction";

export function createToolResultWithMap(
  textResult: string,
  features: MapFeature[],
): string {
  if (features.length === 0) return textResult;

  return JSON.stringify({
    text: textResult,
    [MAP_FEATURES_KEY]: features,
  });
}

export function parseToolResultMapFeatures(
  result: unknown,
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

export function parseToolResultMapAction(
  result: unknown,
): MapActionPayload | null {
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

  const action = obj[MAP_ACTION_KEY];
  if (!action || typeof action !== "object") return null;

  return action as MapActionPayload;
}

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
    // Not JSON.
  }
  return result;
}
