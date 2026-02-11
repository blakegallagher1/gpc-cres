import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const matrixPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");
const testRoot = path.join(repoRoot, "packages/openai/test/phase1");
const reportPath = path.join(repoRoot, "docs/testing/phase1-progress.json");

const PHASE1_PACKS = {
  agent: ["handoff", "uncertainty", "contract"],
  tool: ["schema", "security", "idempotency"],
};

function walk(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function key(matrixId, pack) {
  return `${matrixId}::${pack}`;
}

function relative(p) {
  return path.relative(repoRoot, p).split(path.sep).join("/");
}

function loadMatrix() {
  if (!fs.existsSync(matrixPath)) {
    throw new Error(`Matrix not found: ${relative(matrixPath)}`);
  }
  return JSON.parse(fs.readFileSync(matrixPath, "utf8"));
}

function expectedFromMatrix(matrix) {
  const expected = new Map();
  const components = Array.isArray(matrix.components) ? matrix.components : [];

  for (const component of components) {
    const packs = PHASE1_PACKS[component.type];
    if (!packs) {
      continue;
    }

    for (const pack of packs) {
      expected.set(key(component.id, pack), {
        matrix_id: component.id,
        component_type: component.type,
        pack,
      });
    }
  }

  return expected;
}

function parseActualTests() {
  const actual = new Map();
  const files = walk(testRoot, (p) => p.endsWith(".test.ts")).sort();

  const todoRe = /it\.todo\(\s*["'`]\[MATRIX:([^\]]+)\]\[PACK:([^\]]+)\]/g;
  const implRe = /\bit\(\s*["'`]\[MATRIX:([^\]]+)\]\[PACK:([^\]]+)\]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    for (const match of content.matchAll(todoRe)) {
      const matrixId = match[1];
      const pack = match[2];
      actual.set(key(matrixId, pack), {
        matrix_id: matrixId,
        pack,
        status: "todo",
        file: relative(file),
      });
    }

    for (const match of content.matchAll(implRe)) {
      const matrixId = match[1];
      const pack = match[2];
      actual.set(key(matrixId, pack), {
        matrix_id: matrixId,
        pack,
        status: "implemented",
        file: relative(file),
      });
    }
  }

  return actual;
}

function main() {
  const requireComplete = process.argv.includes("--require-complete");

  const matrix = loadMatrix();
  const expected = expectedFromMatrix(matrix);
  const actual = parseActualTests();

  const missing = [];
  const todo = [];
  const implemented = [];
  const extra = [];

  for (const [k, expectedEntry] of expected.entries()) {
    const found = actual.get(k);
    if (!found) {
      missing.push(expectedEntry);
      continue;
    }

    if (found.status === "implemented") {
      implemented.push(found);
    } else {
      todo.push(found);
    }
  }

  for (const [k, found] of actual.entries()) {
    if (!expected.has(k)) {
      extra.push(found);
    }
  }

  const totalExpected = expected.size;
  const completionPercent = totalExpected === 0 ? 0 : Number(((implemented.length / totalExpected) * 100).toFixed(2));

  const report = {
    generated_at: new Date().toISOString(),
    phase: "phase1",
    source_matrix: relative(matrixPath),
    test_root: relative(testRoot),
    totals: {
      expected_tests: totalExpected,
      implemented_tests: implemented.length,
      todo_tests: todo.length,
      missing_tests: missing.length,
      extra_tests: extra.length,
      completion_percent: completionPercent,
    },
    missing,
    todo,
    implemented,
    extra,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Phase 1 coverage: expected=${totalExpected}, implemented=${implemented.length}, todo=${todo.length}, missing=${missing.length}, extra=${extra.length}, completion=${completionPercent}%`,
  );
  console.log(`Wrote ${relative(reportPath)}`);

  if (missing.length > 0) {
    console.error("Missing matrix-linked test IDs detected.");
    process.exit(1);
  }

  if (requireComplete && todo.length > 0) {
    console.error("Phase 1 is not complete; todo tests remain.");
    process.exit(1);
  }
}

main();
