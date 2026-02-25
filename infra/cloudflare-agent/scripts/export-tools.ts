/* ------------------------------------------------------------------
 * Build-time script: Extract tool schemas + coordinator instructions
 * from the @entitlement-os/openai package and write them as static
 * JSON files for the Cloudflare Worker to import.
 *
 * Run: tsx scripts/export-tools.ts
 * Called automatically by `npm run predeploy`
 * ------------------------------------------------------------------ */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GENERATED_DIR = join(__dirname, "..", "src", "generated");

async function main() {
  mkdirSync(GENERATED_DIR, { recursive: true });

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

  // Add consult tool stubs (these are agent.asTool() at runtime, but we define them as
  // function tools with a simple input schema for the Worker)
  const consultTools = [
    {
      name: "consult_finance_specialist",
      description:
        "Consult Finance Agent for focused underwriting/capital-structure questions while the Coordinator retains control.",
    },
    {
      name: "consult_risk_specialist",
      description:
        "Consult Risk Agent for focused hazard/compliance/uncertainty checks while the Coordinator retains control.",
    },
    {
      name: "consult_legal_specialist",
      description:
        "Consult Legal Agent for focused contract/zoning/legal-risk questions while the Coordinator retains control.",
    },
    {
      name: "consult_market_trajectory_specialist",
      description:
        "Consult Market Trajectory Agent for neighborhood growth analysis, permit activity mapping, and gentrification indicator tracking.",
    },
  ];

  for (const ct of consultTools) {
    schemas.push({
      type: "function",
      name: ct.name,
      description: ct.description,
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "The question or analysis request to pass to the specialist agent",
          },
        },
        required: ["input"],
        additionalProperties: false,
      },
    });
  }

  // Add hosted tool declarations
  schemas.push({
    type: "web_search_preview" as any,
    search_context_size: "medium",
  } as any);

  const toolSchemasPath = join(GENERATED_DIR, "tool-schemas.json");
  writeFileSync(toolSchemasPath, JSON.stringify(schemas, null, 2));
  console.log(`Wrote ${schemas.length} tool schemas to ${toolSchemasPath}`);

  // --- Extract coordinator instructions ---
  const instructionsExport = (coordinator as Record<string, unknown>)
    .COORDINATOR_INSTRUCTIONS;

  if (typeof instructionsExport !== "string") {
    console.error(
      "ERROR: COORDINATOR_INSTRUCTIONS not found or not a string",
    );
    process.exit(1);
  }

  const instructionsPath = join(GENERATED_DIR, "instructions.json");
  writeFileSync(
    instructionsPath,
    JSON.stringify({ COORDINATOR_INSTRUCTIONS: instructionsExport }, null, 2),
  );
  console.log(`Wrote coordinator instructions to ${instructionsPath}`);

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

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
