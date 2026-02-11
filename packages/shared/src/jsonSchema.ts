import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict: true;
};

export function zodToOpenAiJsonSchema(name: string, schema: z.ZodTypeAny): OpenAiJsonSchema {
  // Call without `name` to get a flat schema (no $ref / definitions wrapper).
  const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;

  // Strip meta keys that OpenAI doesn't accept.
  const { $ref, definitions, ...rest } = raw;
  delete (rest as Record<string, unknown>).$schema;

  // If the output still used $ref (shouldn't happen), resolve it from definitions.
  let inlined: Record<string, unknown> = rest;
  if ($ref && definitions && typeof $ref === "string") {
    const defName = $ref.replace("#/definitions/", "");
    const def = (definitions as Record<string, unknown>)[defName];
    if (def && typeof def === "object") {
      inlined = def as Record<string, unknown>;
    }
  }

  // OpenAI Structured Outputs requires additionalProperties: false on every object.
  addAdditionalPropertiesFalse(inlined);

  return {
    name,
    schema: inlined,
    strict: true,
  };
}

/** Recursively set additionalProperties: false on all object schemas. */
function addAdditionalPropertiesFalse(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;
  if (record.type === "object" && record.properties) {
    record.additionalProperties = false;
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) addAdditionalPropertiesFalse(item);
    } else if (value && typeof value === "object") {
      addAdditionalPropertiesFalse(value);
    }
  }
}
