/* ------------------------------------------------------------------
 * Build-time script: Extract tool schemas + coordinator instructions
 * from the @entitlement-os/openai package and write them as static
 * JSON files for the Cloudflare Worker to import.
 *
 * Run: tsx scripts/export-tools.ts
 * Called automatically by `npm run predeploy`
 * ------------------------------------------------------------------ */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GENERATED_DIR = join(__dirname, "..", "src", "generated");
const TOOL_SCHEMAS_PATH = join(GENERATED_DIR, "tool-schemas.json");
const INSTRUCTIONS_PATH = join(GENERATED_DIR, "instructions.json");

export type GeneratedAgentArtifacts = {
  toolSchemas: Array<Record<string, unknown>>;
  instructions: { COORDINATOR_INSTRUCTIONS: string };
};

export async function buildGeneratedAgentArtifacts(): Promise<GeneratedAgentArtifacts> {
  // Dynamic import to load the built package
  const tools = await import("@entitlement-os/openai");
  const coordinator = await import("@entitlement-os/openai");

  // --- Extract tool schemas ---
  const allTools = (tools as Record<string, unknown>).ALL_COORDINATOR_TOOL_OBJECTS;

  if (!Array.isArray(allTools)) {
    console.error("ERROR: ALL_COORDINATOR_TOOL_OBJECTS not found or not an array");
    console.error("Available exports:", Object.keys(tools));
    process.exit(1);
  }

  const schemas: Array<Record<string, unknown>> = [];

  for (const tool of allTools) {
    if (!tool || typeof tool !== "object") continue;

    // @openai/agents FunctionTool objects have .name, .description, .parameters (JSON Schema),
    // .type ("function"), .strict, .invoke, etc.
    const t = tool as {
      name?: string;
      description?: string;
      parameters?: Record<string, unknown>; // Already a JSON Schema object (SDK converts Zod internally)
      type?: string;
    };

    // Skip hosted tools (web_search_preview, file_search)
    if (t.type === "web_search_preview" || t.type === "file_search" || t.type === "hosted_tool") {
      continue;
    }

    if (!t.name) {
      console.warn("Skipping tool without name:", tool);
      continue;
    }

    // .parameters is already a JSON Schema object — the SDK converts Zod to JSON Schema internally.
    // We just need to clone it and strip unsupported constraints.
    let parameters: Record<string, unknown> = { type: "object", properties: {} };

    if (t.parameters && typeof t.parameters === "object") {
      // Deep clone to avoid mutating the original
      parameters = JSON.parse(JSON.stringify(t.parameters));
      // Remove $schema key (not needed for OpenAI tools)
      delete parameters.$schema;
    } else {
      console.warn(`Tool '${t.name}' has no parameters`);
    }

    // Strip unsupported format constraints (OpenAI rejects format: "uri", "email", etc.)
    stripFormatConstraints(parameters);

    schemas.push({
      type: "function",
      name: t.name,
      description: t.description ?? "",
      parameters,
    });
  }

  // Add hosted tool declarations
  schemas.push({
    type: "web_search_preview",
    search_context_size: "medium",
  });

  // --- Extract coordinator instructions ---
  const coordinatorModule = coordinator as Record<string, unknown>;
  const createCoordinator = coordinatorModule.createConfiguredCoordinator;
  const configuredCoordinator =
    typeof createCoordinator === "function" ? createCoordinator() : null;
  const configuredInstructions =
    configuredCoordinator &&
    typeof configuredCoordinator === "object" &&
    "instructions" in configuredCoordinator
      ? (configuredCoordinator as { instructions?: unknown }).instructions
      : null;
  const instructionsExport =
    typeof coordinatorModule.COORDINATOR_INSTRUCTIONS === "string"
      ? coordinatorModule.COORDINATOR_INSTRUCTIONS
      : configuredInstructions;

  if (typeof instructionsExport !== "string") {
    console.error(
      "ERROR: coordinator instructions not found or not a string",
    );
    process.exit(1);
  }

  return {
    toolSchemas: schemas,
    instructions: { COORDINATOR_INSTRUCTIONS: instructionsExport },
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readGeneratedJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertGeneratedArtifactsCurrent(artifacts: GeneratedAgentArtifacts): void {
  const staleFiles: string[] = [];
  if (formatJson(readGeneratedJson(TOOL_SCHEMAS_PATH)) !== formatJson(artifacts.toolSchemas)) {
    staleFiles.push(TOOL_SCHEMAS_PATH);
  }
  if (formatJson(readGeneratedJson(INSTRUCTIONS_PATH)) !== formatJson(artifacts.instructions)) {
    staleFiles.push(INSTRUCTIONS_PATH);
  }

  if (staleFiles.length > 0) {
    throw new Error(
      `Generated Cloudflare Agent artifacts are stale: ${staleFiles.join(", ")}. ` +
        "Run pnpm --filter entitlement-os-agent export-tools.",
    );
  }
}

async function main() {
  mkdirSync(GENERATED_DIR, { recursive: true });

  const artifacts = await buildGeneratedAgentArtifacts();

  if (process.argv.includes("--check")) {
    assertGeneratedArtifactsCurrent(artifacts);
    console.log("Generated Cloudflare Agent artifacts are up to date.");
    return;
  }

  writeFileSync(TOOL_SCHEMAS_PATH, formatJson(artifacts.toolSchemas));
  console.log(`Wrote ${artifacts.toolSchemas.length} tool schemas to ${TOOL_SCHEMAS_PATH}`);

  writeFileSync(INSTRUCTIONS_PATH, formatJson(artifacts.instructions));
  console.log(`Wrote coordinator instructions to ${INSTRUCTIONS_PATH}`);

  console.log("\nExport complete!");
}

/** Recursively strip `format` constraints from JSON schema (OpenAI rejects them) */
function stripFormatConstraints(schema: Record<string, unknown>): void {
  if ("format" in schema) {
    delete schema.format;
  }
  if (schema.properties && typeof schema.properties === "object") {
    for (const value of Object.values(
      schema.properties as Record<string, Record<string, unknown>>,
    )) {
      if (value && typeof value === "object") {
        stripFormatConstraints(value);
      }
    }
  }
  if (schema.items && typeof schema.items === "object") {
    stripFormatConstraints(schema.items as Record<string, unknown>);
  }
  if (Array.isArray(schema.anyOf)) {
    for (const item of schema.anyOf) {
      if (item && typeof item === "object") {
        stripFormatConstraints(item as Record<string, unknown>);
      }
    }
  }
  if (Array.isArray(schema.oneOf)) {
    for (const item of schema.oneOf) {
      if (item && typeof item === "object") {
        stripFormatConstraints(item as Record<string, unknown>);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("Export failed:", err);
    process.exit(1);
  });
}
