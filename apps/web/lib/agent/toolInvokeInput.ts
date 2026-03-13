type JsonSchema = Record<string, unknown>;

function isJsonSchemaObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaAllowsNull(schema: unknown): boolean {
  if (!isJsonSchemaObject(schema)) {
    return false;
  }

  const type = schema.type;
  if (type === "null") {
    return true;
  }
  if (Array.isArray(type) && type.includes("null")) {
    return true;
  }

  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    return anyOf.some((candidate) => schemaAllowsNull(candidate));
  }

  return false;
}

export function hydrateRequiredNullableToolArgs(
  schema: unknown,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!isJsonSchemaObject(schema)) {
    return args;
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
  if (required.length === 0) {
    return args;
  }

  const properties = isJsonSchemaObject(schema.properties)
    ? schema.properties
    : null;
  if (!properties) {
    return args;
  }

  let nextArgs = args;

  for (const key of required) {
    if (Object.prototype.hasOwnProperty.call(nextArgs, key)) {
      continue;
    }

    if (!schemaAllowsNull(properties[key])) {
      continue;
    }

    if (nextArgs === args) {
      nextArgs = { ...args };
    }
    nextArgs[key] = null;
  }

  return nextArgs;
}
