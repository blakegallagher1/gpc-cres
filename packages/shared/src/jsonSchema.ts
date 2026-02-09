import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type OpenAiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict: true;
};

export function zodToOpenAiJsonSchema(name: string, schema: z.ZodTypeAny): OpenAiJsonSchema {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    // OpenAI Structured Outputs requires explicit object schemas; keep it strict.
    $refStrategy: "none",
  });

  return {
    name,
    schema: jsonSchema as unknown as Record<string, unknown>,
    strict: true,
  };
}

