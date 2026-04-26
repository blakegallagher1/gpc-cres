import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const serverRoot = path.join(root, "packages/server/src");
const workerRoot = path.join(root, "apps/worker/src");

const highBlastRadiusServerDomains = [
  "admin",
  "automation",
  "chat",
  "deals",
  "jobs",
  "monitoring",
  "notifications",
  "observability",
  "search",
  "services",
  "workflows",
] as const;

const requiredRootExports = [
  "./chat/run-state",
  "./workflows/workflow-orchestrator.service",
  "./deals/deal.service",
  "./deals/deal-reader.service",
  "./deals/triage.service",
  "./automation/portfolio-watcher.service",
  "./automation/automation-event.service",
  "./services/investment-criteria.service",
  "./services/run-route.service",
  "./observability/run-dashboard.service",
  "./observability/health-status.service",
  "./search/parcel-search.service",
  "./search/prospect-search.service",
] as const;

const requiredWorkerExports = {
  activityBarrels: ["./evidence.js", "./openai.js", "./artifacts.js", "./data.js"],
  workflows: [
    "agentRunWorkflow",
    "parishPackRefreshWorkflow",
    "bulkArtifactWorkflow",
    "dealIntakeWorkflow",
    "triageWorkflow",
    "changeDetectionWorkflow",
  ],
} as const;

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return listFilesRecursive(fullPath);
    }
    return [fullPath];
  });
}

function tsFilesUnder(dir: string): string[] {
  return listFilesRecursive(dir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
}

function testFilesUnder(dir: string): string[] {
  return listFilesRecursive(dir).filter((file) => file.endsWith(".test.ts"));
}

function exportTargetExists(target: string): boolean {
  const normalizedTarget = target.replace("./", "");
  const candidate = path.join(serverRoot, `${normalizedTarget}.ts`);
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;
}

describe("shared execution core contracts", () => {
  it("keeps the @gpc/server package export map aligned with high-blast-radius domains", () => {
    const serverPackageJson = JSON.parse(read("packages/server/package.json")) as {
      exports: Record<string, string>;
    };

    for (const domain of highBlastRadiusServerDomains) {
      expect(serverPackageJson.exports[`./${domain}/*`]).toBe(`./src/${domain}/*.ts`);
    }
  });

  it("keeps critical server modules exported from the root barrel", () => {
    const indexSource = read("packages/server/src/index.ts");

    for (const target of requiredRootExports) {
      expect(exportTargetExists(target), `${target} exists`).toBe(true);
      expect(indexSource, `${target} is exported from @gpc/server`).toContain(`"${target}"`);
    }
  });

  it("keeps direct contract coverage above the initial floor", () => {
    const serverFiles = tsFilesUnder(serverRoot).length;
    const serverTests = testFilesUnder(serverRoot).length;
    const workerFiles = tsFilesUnder(workerRoot).length;
    const workerTests = testFilesUnder(workerRoot).length;

    expect(serverFiles).toBeGreaterThanOrEqual(200);
    expect(serverTests).toBeGreaterThanOrEqual(3);
    expect(workerFiles).toBeGreaterThanOrEqual(15);
    expect(workerTests).toBeGreaterThanOrEqual(1);
  });
});

describe("worker execution contracts", () => {
  it("keeps worker activities exported from the activity barrel", () => {
    const activityIndex = read("apps/worker/src/activities/index.ts");

    for (const activityBarrel of requiredWorkerExports.activityBarrels) {
      expect(activityIndex, `${activityBarrel} is exported`).toContain(activityBarrel);
    }
  });

  it("keeps worker workflows exported from the workflow barrel", () => {
    const workflowIndex = read("apps/worker/src/workflows/index.ts");

    for (const workflowName of requiredWorkerExports.workflows) {
      expect(workflowIndex, `${workflowName} is exported`).toContain(workflowName);
    }
  });

  it("keeps the worker process wired to the shared activity and workflow barrels", () => {
    const workerSource = read("apps/worker/src/worker.ts");

    expect(workerSource).toContain("from \"./activities/index.js\"");
    expect(workerSource).toContain("workflowsPath");
    expect(workerSource).toContain("./workflows/index.ts");
    expect(workerSource).toContain("./workflows/index.js");
  });
});
