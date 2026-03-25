import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "../../..");
  const matrixPath = path.join(repoRoot, "docs/testing/test-matrix-starter.json");
  const raw = fs.readFileSync(matrixPath, "utf8");
  return JSON.parse(raw) as MatrixFile;
}

describe("test matrix starter", () => {
  it("captures the expected core inventory counts", () => {
    const matrix = loadMatrix();

    // Unified consolidation: Single EntitlementOS agent (coordinator + all specialists)
    expect(matrix.summary.counts.agents).toBe(1);
    expect(matrix.summary.counts.tools).toBe(55);
    expect(matrix.summary.counts.api_routes).toBe(66);
    expect(matrix.summary.counts.automation_modules).toBe(15);
    expect(matrix.summary.counts.features).toBeGreaterThanOrEqual(10);
    expect(matrix.summary.counts.total_components).toBeGreaterThanOrEqual(122);
  });

  it("contains the unified EntitlementOS agent as the core coordinator", () => {
    const matrix = loadMatrix();
    const componentIds = new Set(matrix.components.map((c) => c.id));

    // Unified consolidation: Single EntitlementOS agent with comprehensive tooling
    // replaces the 13-agent multi-agent architecture. The agent provides all
    // capabilities previously distributed across specialist agents.
    expect(componentIds.has("agent:coordinator")).toBe(true);
  });

  it("contains the tool pass-through capability and all typed tools", () => {
    const matrix = loadMatrix();
    const toolIds = matrix.components.filter((c) => c.type === "tool").map((c) => c.id);

    expect(toolIds).toHaveLength(55);
    expect(toolIds.includes("tool:webSearchPreviewTool")).toBe(true);
    expect(toolIds.includes("tool:get_entitlement_feature_primitives")).toBe(true);
  });
});
