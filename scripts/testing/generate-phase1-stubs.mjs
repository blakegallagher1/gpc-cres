import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const matrixPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");
const outRoot = path.join(repoRoot, "packages/openai/test/phase1");

const AGENT_PACKS = ["handoff", "uncertainty", "contract"];
const TOOL_PACKS = ["schema", "security", "idempotency"];

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function readMatrix() {
  if (!fs.existsSync(matrixPath)) {
    throw new Error(`Matrix not found: ${matrixPath}`);
  }
  return JSON.parse(fs.readFileSync(matrixPath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeAgentStub(component) {
  const name = safeName(component.name);
  const filePath = path.join(outRoot, "agents", `${name}.phase1.test.ts`);
  const matrixId = component.id;

  const content = `import { describe, it } from "vitest";

describe("Phase 1 Agent Pack :: ${component.name}", () => {
  it.todo("[MATRIX:${matrixId}][PACK:handoff] verifies specialist handoff routing and contradiction resolution");
  it.todo("[MATRIX:${matrixId}][PACK:uncertainty] enforces uncertainty scoring, reanalysis triggers, and confidence boundaries");
  it.todo("[MATRIX:${matrixId}][PACK:contract] validates structured output schema and required evidence fields");
});
`;

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function writeToolStub(component) {
  const name = safeName(component.name);
  const filePath = path.join(outRoot, "tools", `${name}.phase1.test.ts`);
  const matrixId = component.id;

  const content = `import { describe, it } from "vitest";

describe("Phase 1 Tool Pack :: ${component.name}", () => {
  it.todo("[MATRIX:${matrixId}][PACK:schema] validates input/output schema contract and malformed payload rejection");
  it.todo("[MATRIX:${matrixId}][PACK:security] validates auth, org scoping, and cross-tenant access protections");
  it.todo("[MATRIX:${matrixId}][PACK:idempotency] validates retry safety and duplicate-write prevention behavior");
});
`;

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function main() {
  const matrix = readMatrix();
  const components = Array.isArray(matrix.components) ? matrix.components : [];

  const agents = components.filter((c) => c.type === "agent").sort((a, b) => a.id.localeCompare(b.id));
  const tools = components.filter((c) => c.type === "tool").sort((a, b) => a.id.localeCompare(b.id));

  ensureDir(path.join(outRoot, "agents"));
  ensureDir(path.join(outRoot, "tools"));

  const files = [];
  for (const agent of agents) {
    files.push(writeAgentStub(agent));
  }
  for (const tool of tools) {
    files.push(writeToolStub(tool));
  }

  const registry = {
    generated_at: new Date().toISOString(),
    source_matrix: "docs/testing/test-matrix-starter.json",
    phase: "phase1",
    packs: {
      agent: AGENT_PACKS,
      tool: TOOL_PACKS,
    },
    counts: {
      agent_components: agents.length,
      tool_components: tools.length,
      generated_files: files.length,
      generated_tests: agents.length * AGENT_PACKS.length + tools.length * TOOL_PACKS.length,
    },
    files: files
      .map((filePath) => path.relative(repoRoot, filePath).split(path.sep).join("/"))
      .sort(),
  };

  fs.writeFileSync(
    path.join(repoRoot, "docs/testing/phase1-stub-registry.json"),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Generated Phase 1 stubs: agents=${agents.length}, tools=${tools.length}, files=${files.length}, tests=${registry.counts.generated_tests}`,
  );
}

main();
