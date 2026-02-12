import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const outputJsonPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");
const outputCsvPath = path.join(repoRoot, "docs/testing/test-matrix-starter.csv");

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

function withCommonFields(item) {
  return {
    ...item,
    owner: "TBD",
    status: "todo",
    risk_tier: item.risk_tier ?? "P1",
    required_tests: REQUIRED_TESTS[item.type],
    notes: item.notes ?? "",
  };
}

function discoverAgents() {
  const agentDir = path.join(repoRoot, "packages/openai/src/agents");
  return walk(agentDir, (p) => p.endsWith(".ts"))
    .filter((p) => path.basename(p) !== "index.ts")
    .sort()
    .map((p) => {
      const name = path.basename(p, ".ts");
      return withCommonFields({
        id: `agent:${name}`,
        type: "agent",
        name,
        path: relative(p),
        risk_tier: name === "coordinator" ? "P0" : "P1",
      });
    });
}

function discoverTools() {
  const toolDir = path.join(repoRoot, "packages/openai/src/tools");
  const files = walk(toolDir, (p) => p.endsWith(".ts")).sort();

  const tools = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const regex = /export const\s+([A-Za-z0-9_]+)\s*=\s*tool\(/g;
    for (const match of content.matchAll(regex)) {
      const toolName = match[1];
      tools.push(
        withCommonFields({
          id: `tool:${toolName}`,
          type: "tool",
          name: toolName,
          path: relative(file),
          risk_tier: "P1",
        }),
      );
    }
  }

  const toolIndexPath = path.join(toolDir, "index.ts");
  const toolIndex = fs.readFileSync(toolIndexPath, "utf8");
  if (/export const\s+webSearchPreviewTool\s*=\s*\{/.test(toolIndex)) {
    tools.push(
      withCommonFields({
        id: "tool:webSearchPreviewTool",
        type: "tool",
        name: "webSearchPreviewTool",
        path: relative(toolIndexPath),
        risk_tier: "P1",
        notes: "Pass-through capability (non tool(...) wrapper)",
      }),
    );
  }

  const unique = new Map();
  for (const item of tools) {
    unique.set(item.id, item);
  }

  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function discoverApiRoutes() {
  const apiDir = path.join(repoRoot, "apps/web/app/api");
  return walk(apiDir, (p) => p.endsWith("/route.ts") || p.endsWith("\\route.ts"))
    .sort()
    .map((p) => {
      const rel = relative(p);
      const routeName = rel.replace(/^apps\/web\/app\/api\//, "").replace(/\/route\.ts$/, "");
      return withCommonFields({
        id: `api_route:${routeName}`,
        type: "api_route",
        name: routeName,
        path: rel,
        risk_tier: "P0",
      });
    });
}

function discoverAutomationModules() {
  const automationDir = path.join(repoRoot, "apps/web/lib/automation");
  return walk(
    automationDir,
    (p) => p.endsWith(".ts") && !p.includes(`${path.sep}__tests__${path.sep}`),
  )
    .filter((p) => path.dirname(p) === automationDir)
    .sort()
    .map((p) => {
      const name = path.basename(p, ".ts");
      return withCommonFields({
        id: `automation:${name}`,
        type: "automation",
        name,
        path: relative(p),
        risk_tier: name === "events" || name === "handlers" || name === "config" ? "P0" : "P1",
      });
    });
}

function discoverFeatureFunctions() {
  const features = [];

  const adaptivePath = path.join(repoRoot, "packages/shared/src/scoring/adaptiveWeights.ts");
  const adaptiveContent = fs.readFileSync(adaptivePath, "utf8");
  const functionRegex = /export function\s+([A-Za-z0-9_]+)\s*\(/g;
  for (const match of adaptiveContent.matchAll(functionRegex)) {
    const fn = match[1];
    features.push(
      withCommonFields({
        id: `feature:${fn}`,
        type: "feature",
        name: fn,
        path: relative(adaptivePath),
        risk_tier: "P0",
      }),
    );
  }

  features.push(
    withCommonFields({
      id: "feature:createConfiguredCoordinator",
      type: "feature",
      name: "createConfiguredCoordinator",
      path: "packages/openai/src/agents/index.ts",
      risk_tier: "P0",
    }),
    withCommonFields({
      id: "feature:buildAgentStreamRunOptions",
      type: "feature",
      name: "buildAgentStreamRunOptions",
      path: "packages/openai/src/runtime.ts",
      risk_tier: "P1",
    }),
    withCommonFields({
      id: "feature:createStrictJsonResponse",
      type: "feature",
      name: "createStrictJsonResponse",
      path: "packages/openai/src/responses.ts",
      risk_tier: "P0",
    }),
    withCommonFields({
      id: "feature:triageScoringModel",
      type: "feature",
      name: "triageScoringModel",
      path: "packages/shared/src/scoring/triage.ts",
      risk_tier: "P0",
    }),
    withCommonFields({
      id: "feature:hardFilterFramework",
      type: "feature",
      name: "hardFilterFramework",
      path: "packages/shared/src/scoring/hardFilters.ts",
      risk_tier: "P0",
    }),
    withCommonFields({
      id: "feature:weightBandSystem",
      type: "feature",
      name: "weightBandSystem",
      path: "packages/shared/src/scoring/weights.ts",
      risk_tier: "P1",
    }),
  );

  const unique = new Map();
  for (const item of features) {
    unique.set(item.id, item);
  }

  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function toCsv(components) {
  const header = [
    "id",
    "type",
    "name",
    "path",
    "risk_tier",
    "owner",
    "status",
    "required_tests",
    "notes",
  ];

  const rows = [header.join(",")];
  for (const c of components) {
    const values = [
      c.id,
      c.type,
      c.name,
      c.path,
      c.risk_tier,
      c.owner,
      c.status,
      c.required_tests.join("|"),
      c.notes ?? "",
    ].map((value) => {
      const safe = String(value).replace(/"/g, '""');
      return `"${safe}"`;
    });
    rows.push(values.join(","));
  }

  return rows.join("\n") + "\n";
}

function main() {
  const agents = discoverAgents();
  const tools = discoverTools();
  const apiRoutes = discoverApiRoutes();
  const automations = discoverAutomationModules();
  const features = discoverFeatureFunctions();

  const components = [...agents, ...tools, ...apiRoutes, ...automations, ...features].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const matrix = {
    metadata: {
      generated_at: new Date().toISOString(),
      generated_by: "scripts/testing/generate-test-matrix.mjs",
      repository_root: repoRoot,
      intent: "Starter matrix for complete component-level testing coverage.",
      required_test_definitions: REQUIRED_TESTS,
    },
    summary: {
      counts: {
        agents: agents.length,
        tools: tools.length,
        api_routes: apiRoutes.length,
        automation_modules: automations.length,
        features: features.length,
        total_components: components.length,
      },
      baseline_targets: {
        agents: 13,
        tools: 54,
        tool_capabilities_including_pass_through: 55,
        api_routes: 66,
        automation_modules: 15,
      },
      notes: [
        "Tool baseline includes webSearchPreviewTool pass-through capability.",
        "Feature components model runtime/scoring/intelligence capabilities that are not route/agent/tool files.",
      ],
    },
    components,
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  fs.writeFileSync(outputCsvPath, toCsv(components), "utf8");

  const counts = matrix.summary.counts;
  console.log(
    `Generated matrix: agents=${counts.agents}, tools=${counts.tools}, api_routes=${counts.api_routes}, automation_modules=${counts.automation_modules}, features=${counts.features}, total=${counts.total_components}`,
  );
  console.log(`Wrote ${relative(outputJsonPath)} and ${relative(outputCsvPath)}`);
}

main();
