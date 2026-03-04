import { z } from "zod";

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict: true;
};

export function zodToOpenAiJsonSchema(name: string, schema: z.ZodTypeAny): OpenAiJsonSchema {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $defs, ...rest } = raw;
  void $defs;

  // Strip meta keys that OpenAI doesn't accept.
  delete (rest as Record<string, unknown>).$schema;

  // OpenAI Structured Outputs requires additionalProperties: false on every object.
  addAdditionalPropertiesFalse(rest);

  return {
    name,
    schema: rest,
    strict: true,
  };
}

/** Keys that OpenAI Structured Outputs does not permit. */
const DISALLOWED_KEYS = new Set(["propertyNames", "format"]);

/** Recursively set additionalProperties: false on all object schemas,
 *  ensure all properties are in `required`, and strip disallowed keys.
 *  OpenAI Structured Outputs strict mode requires every property key to
 *  appear in the required array. */
function addAdditionalPropertiesFalse(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;
  for (const key of DISALLOWED_KEYS) {
    delete record[key];
  }
  if (record.type === "object" && record.properties) {
    record.additionalProperties = false;
    const propKeys = Object.keys(record.properties as Record<string, unknown>);
    if (propKeys.length > 0) {
      record.required = propKeys;
    }
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) addAdditionalPropertiesFalse(item);
    } else if (value && typeof value === "object") {
      addAdditionalPropertiesFalse(value);
    }
  }
}
