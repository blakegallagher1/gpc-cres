import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type MatrixComponent = {
  id: string;
  type: string;
};

type MatrixFile = {
  summary: {
    counts: {
      agents: number;
      tools: number;
      api_routes: number;
      automation_modules: number;
      features: number;
      total_components: number;
    };
  };
  components: MatrixComponent[];
};

function loadMatrix(): MatrixFile {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const matrixPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");
  const raw = fs.readFileSync(matrixPath, "utf8");
  return JSON.parse(raw) as MatrixFile;
}

describe("test matrix starter", () => {
  it("captures the expected core inventory counts", () => {
    const matrix = loadMatrix();

    expect(matrix.summary.counts.agents).toBe(13);
    expect(matrix.summary.counts.tools).toBe(54);
    expect(matrix.summary.counts.api_routes).toBe(65);
    expect(matrix.summary.counts.automation_modules).toBe(15);
    expect(matrix.summary.counts.features).toBeGreaterThanOrEqual(10);
    expect(matrix.summary.counts.total_components).toBeGreaterThanOrEqual(157);
  });

  it("contains all named specialist/coordinator agents", () => {
    const matrix = loadMatrix();
    const componentIds = new Set(matrix.components.map((c) => c.id));

    const requiredAgents = [
      "agent:coordinator",
      "agent:legal",
      "agent:research",
      "agent:risk",
      "agent:finance",
      "agent:screener",
      "agent:dueDiligence",
      "agent:entitlements",
      "agent:design",
      "agent:operations",
      "agent:marketing",
      "agent:tax",
      "agent:marketIntel",
    ];

    for (const agent of requiredAgents) {
      expect(componentIds.has(agent)).toBe(true);
    }
  });

  it("contains the tool pass-through capability and all typed tools", () => {
    const matrix = loadMatrix();
    const toolIds = matrix.components.filter((c) => c.type === "tool").map((c) => c.id);

    expect(toolIds).toHaveLength(54);
    expect(toolIds.includes("tool:webSearchPreviewTool")).toBe(true);
  });
});
