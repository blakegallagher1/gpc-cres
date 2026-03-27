/**
 * Strict JSON Schema Validation Utility
 *
 * Ensures JSON schemas are compatible with OpenAI's structured outputs by:
 * - Removing unsupported format constraints
 * - Removing unsupported numeric/string/array constraints
 * - Adding additionalProperties: false to objects
 * - Ensuring required arrays are complete
 * - Recursively processing nested structures
 * - Handling circular references safely
 *
 * Ported from Python SDK's ensure_strict_json_schema() function.
 */

/**
 * Format constraints that OpenAI does not support
 */
const UNSUPPORTED_FORMATS = new Set([
  "uri",
  "url",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "date",
  "date-time",
  "time",
  "duration",
  "uuid",
  "regex",
  "json-pointer",
  "relative-json-pointer",
  "uri-reference",
  "uri-template",
  "iri",
  "iri-reference",
]);

/**
 * Constraints that OpenAI does not support
 */
const UNSUPPORTED_CONSTRAINTS = new Set([
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

/**
 * Properties that should be preserved and never removed
 */
const PRESERVED_PROPERTIES = new Set([
  "type",
  "enum",
  "const",
  "default",
  "items",
  "properties",
  "required",
  "additionalProperties",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "$defs",
  "$ref",
  "description",
  "title",
]);

/**
 * Recursively ensure a JSON schema is strict and OpenAI-compatible
 * @param schema - The JSON schema to validate
 * @returns A new schema with strict constraints applied
 */
export function ensureStrictJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const visited = new Set<object>();
  return walkSchema(schema, visited) as Record<string, unknown>;
}

/**
 * Recursively walk through a schema and apply strict constraints
 * @param obj - The current schema object
 * @param visited - Set of already-visited objects (for circular reference detection)
 * @returns A new schema object with strict constraints
 */
function walkSchema(obj: unknown, visited: Set<object>): unknown {
  // Handle non-object types
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  // Handle arrays (preserve them as-is, but walk their elements)
  if (Array.isArray(obj)) {
    return obj.map((item) => walkSchema(item, visited));
  }

  // Detect circular references
  if (visited.has(obj)) {
    return obj;
  }

  visited.add(obj);

  const schema = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Process all properties
  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported constraints
    if (UNSUPPORTED_CONSTRAINTS.has(key)) {
      continue;
    }

    // Skip unsupported format constraints
    if (key === "format" && typeof value === "string") {
      if (UNSUPPORTED_FORMATS.has(value)) {
        continue;
      }
    }

    // For properties, recursively walk each nested schema
    if (key === "properties") {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const props = value as Record<string, unknown>;
        const processedProps: Record<string, unknown> = {};
        for (const [propKey, propValue] of Object.entries(props)) {
          processedProps[propKey] = walkSchema(propValue, visited);
        }
        result[key] = processedProps;
      } else {
        result[key] = value;
      }
    } else if (key === "items") {
      const walked = walkSchema(value, visited);
      if (typeof walked === "object") {
        result[key] = walked;
      } else {
        result[key] = value;
      }
    } else if (key === "$defs") {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const defs = value as Record<string, unknown>;
        const processedDefs: Record<string, unknown> = {};
        for (const [defKey, defValue] of Object.entries(defs)) {
          processedDefs[defKey] = walkSchema(defValue, visited);
        }
        result[key] = processedDefs;
      } else {
        result[key] = value;
      }
    } else if (key === "additionalProperties") {
      // additionalProperties can be boolean or object schema
      const walked = walkSchema(value, visited);
      result[key] = walked;
    } else if (key === "anyOf" || key === "oneOf" || key === "allOf") {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => walkSchema(item, visited));
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  // Add or update required array if properties exist
  if (typeof result.properties === "object" && result.properties !== null) {
    const properties = result.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(properties);

    if (propertyKeys.length > 0) {
      const existingRequired = Array.isArray(result.required)
        ? (result.required as string[])
        : [];

      // Ensure all properties are in required
      const allRequired = Array.from(
        new Set([...existingRequired, ...propertyKeys]),
      );
      result.required = allRequired;

      // Add additionalProperties: false if not explicitly set
      if (!("additionalProperties" in result)) {
        result.additionalProperties = false;
      }
    }
  }

  return result;
}
