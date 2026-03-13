import fs from "node:fs";
import path from "node:path";

export type JsonSchemaLike = {
  type?: string;
  properties?: Record<string, JsonSchemaPropLike>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaPropLike = {
  type?: string;
  format?: string;
  const?: unknown;
  anyOf?: JsonSchemaPropLike[];
};

export type AgentToolLike = {
  type?: string;
  name?: string;
  strict?: boolean;
  parameters?: JsonSchemaLike;
  invoke?: unknown;
};

export function readRepoSource(repoRelativePath: string): string {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const sourcePath = path.join(repoRoot, repoRelativePath);
  return fs.readFileSync(sourcePath, "utf8");
}

export function getRequiredFields(tool: AgentToolLike): string[] {
  const required = tool.parameters?.required;
  return Array.isArray(required) ? required : [];
}

export function getSchemaProp(tool: AgentToolLike, key: string): JsonSchemaPropLike | undefined {
  const props = tool.parameters?.properties;
  const prop = props ? props[key] : undefined;
  if (!prop) {
    return undefined;
  }
  if (prop.type || prop.format) {
    return prop;
  }
  if (Array.isArray(prop.anyOf)) {
    return (
      prop.anyOf.find((variant) => variant.type === "string" && variant.format === "uuid") ??
      prop.anyOf.find((variant) => variant.type === "string") ??
      prop
    );
  }
  return prop;
}
