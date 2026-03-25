import { describe, expect, test } from "vitest";

import { toolRegistry } from "@/lib/agent/toolRegistry";

describe("toolRegistry", () => {
  test("lists at least a stable number of executable tools", () => {
    const total = Object.keys(toolRegistry).length;
    console.log(`toolRegistry size = ${total}`);
    expect(total).toBeGreaterThan(0);
  });

  test("contains known executable tools from EntitlementOS agent", () => {
    const requiredTools = [
      "screen_batch",
      "run_underwriting_workflow",
      "run_data_extraction_workflow",
      "run_underwriting",
      "summarize_comps",
      "ingest_comps",
      "query_document_extractions",
      "search_nearby_places",
      "get_historical_accuracy",
    ];

    const missing = requiredTools.filter(
      (toolName) => !Object.prototype.hasOwnProperty.call(toolRegistry, toolName),
    );
    if (missing.length > 0) {
      console.log(
        "missing from registry:",
        missing.join(", "),
      );
      console.log("sample keys:", Object.keys(toolRegistry).slice(0, 25).join(", "));
    }

    for (const toolName of requiredTools) {
      expect(Object.prototype.hasOwnProperty.call(toolRegistry, toolName)).toBe(true);
      expect(typeof toolRegistry[toolName]).toBe("function");
    }
  });

  test("registers legacy aliases and canonical tool names to the same executor", () => {
    expect(toolRegistry.searchParcels).toBe(toolRegistry.search_parcels);
    expect(toolRegistry.createArtifact).toBe(toolRegistry.generate_artifact);
    expect(toolRegistry.create_artifact).toBe(toolRegistry.generate_artifact);
  });

  test("does not expose undefined execute handlers", () => {
    for (const [toolName, executor] of Object.entries(toolRegistry)) {
      expect(executor).toBeTypeOf("function");
      expect(toolName.length).toBeGreaterThan(0);
    }
  });
});
