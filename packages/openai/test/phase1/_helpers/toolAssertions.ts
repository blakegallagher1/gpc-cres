import fs from "node:fs";
import path from "node:path";

export type JsonSchemaLike = {
  type?: string;
  properties?: Record<string, { type?: string; format?: string }>;
  required?: string[];
  additionalProperties?: boolean;
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

export function getSchemaProp(tool: AgentToolLike, key: string): { type?: string; format?: string } | undefined {
  const props = tool.parameters?.properties;
  return props ? props[key] : undefined;
}
