import { createHash } from "node:crypto";

export function hashBytesSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "object": {
      // JSON.parse only creates plain objects with string keys, but we still defensively normalize here.
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        out[key] = canonicalizeJsonValue(obj[key]);
      }
      return out;
    }
    default:
      // This should never happen for values produced by JSON.parse.
      return null;
  }
}

export function stableJsonStringify(value: unknown): string {
  // Use JSON.stringify first to apply native JSON semantics (toJSON, undefined handling, etc).
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("Value is not JSON-serializable (JSON.stringify returned undefined)");
  }

  const parsed = JSON.parse(json) as unknown;
  const canonical = canonicalizeJsonValue(parsed);
  return JSON.stringify(canonical);
}

export function hashJsonSha256(value: unknown): string {
  const json = stableJsonStringify(value);
  return createHash("sha256").update(json).digest("hex");
}
