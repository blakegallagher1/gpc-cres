import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const matrixPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");

const REQUIRED_TESTS = {
  agent: ["unit", "contract", "integration", "resilience", "regression"],
  tool: ["unit", "contract", "security", "integration", "resilience"],
  api_route: ["contract", "security", "integration", "resilience"],
  automation: ["unit", "contract", "integration", "resilience", "regression"],
  feature: ["unit", "contract", "regression"],
};

function walk(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, predicate));
      continue;
    }

    if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function relative(p) {
  return path.relative(repoRoot, p).split(path.sep).join("/");
}

function discoverIds() {
  const ids = [];

  const agentDir = path.join(repoRoot, "packages/openai/src/agents");
  for (const file of walk(agentDir, (p) => p.endsWith(".ts"))) {
    if (path.basename(file) === "index.ts") {
      continue;
    }
    ids.push(`agent:${path.basename(file, ".ts")}`);
  }

  const toolDir = path.join(repoRoot, "packages/openai/src/tools");
  for (const file of walk(toolDir, (p) => p.endsWith(".ts"))) {
    const content = fs.readFileSync(file, "utf8");
    const regex = /export const\s+([A-Za-z0-9_]+)\s*=\s*tool\(/g;
    for (const match of content.matchAll(regex)) {
      ids.push(`tool:${match[1]}`);
    }
  }
  const toolIndex = fs.readFileSync(path.join(toolDir, "index.ts"), "utf8");
  if (/export const\s+webSearchPreviewTool\s*=\s*\{/.test(toolIndex)) {
    ids.push("tool:webSearchPreviewTool");
  }

  const apiDir = path.join(repoRoot, "apps/web/app/api");
  for (const file of walk(apiDir, (p) => p.endsWith("/route.ts") || p.endsWith("\\route.ts"))) {
    const rel = relative(file);
    const routeName = rel.replace(/^apps\/web\/app\/api\//, "").replace(/\/route\.ts$/, "");
    ids.push(`api_route:${routeName}`);
  }

  const automationDir = path.join(repoRoot, "apps/web/lib/automation");
  for (const file of walk(automationDir, (p) => p.endsWith(".ts"))) {
    if (file.includes(`${path.sep}__tests__${path.sep}`) || path.dirname(file) !== automationDir) {
      continue;
    }
    ids.push(`automation:${path.basename(file, ".ts")}`);
  }

  return [...new Set(ids)].sort();
}

function assertRequiredTestTypes(components) {
  const errors = [];
  for (const c of components) {
    const required = REQUIRED_TESTS[c.type];
    if (!required) {
      errors.push(`Unknown component type for ${c.id}: ${c.type}`);
      continue;
    }

    if (!Array.isArray(c.required_tests)) {
      errors.push(`Missing required_tests for ${c.id}`);
      continue;
    }

    for (const testType of required) {
      if (!c.required_tests.includes(testType)) {
        errors.push(`Component ${c.id} missing required test type: ${testType}`);
      }
    }
  }

  return errors;
}

function main() {
  if (!fs.existsSync(matrixPath)) {
    console.error(`Matrix not found: ${relative(matrixPath)}`);
    process.exit(1);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const components = Array.isArray(matrix.components) ? matrix.components : [];
  const matrixIds = components.map((c) => c.id).sort();
  const discoveredIds = discoverIds();

  const duplicateIds = matrixIds.filter((id, index) => index > 0 && id === matrixIds[index - 1]);
  if (duplicateIds.length > 0) {
    console.error(`Duplicate ids in matrix: ${duplicateIds.join(", ")}`);
    process.exit(1);
  }

  const missingFromMatrix = discoveredIds.filter((id) => !matrixIds.includes(id));
  const validationErrors = assertRequiredTestTypes(components);

  if (missingFromMatrix.length > 0 || validationErrors.length > 0) {
    if (missingFromMatrix.length > 0) {
      console.error("Missing discovered components in matrix:");
      for (const id of missingFromMatrix) {
        console.error(`  - ${id}`);
      }
    }

    if (validationErrors.length > 0) {
      console.error("Matrix validation errors:");
      for (const err of validationErrors) {
        console.error(`  - ${err}`);
      }
    }

    process.exit(1);
  }

  console.log(
    `Matrix validation passed: discovered=${discoveredIds.length}, registered=${components.length}, path=${relative(matrixPath)}`,
  );
}

main();
