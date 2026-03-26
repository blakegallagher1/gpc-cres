import { describe, expect, it } from "vitest";

import {
  analyze_market_workflow,
  run_data_extraction_workflow,
  run_underwriting_workflow,
} from "../../../src/tools/shellWorkflowTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

type JsonSchemaVariant = {
  type?: string;
};

type JsonSchemaProperty = {
  type?: string | string[];
  anyOf?: JsonSchemaVariant[];
};

function expectRequiredNullableField(
  tool: { parameters?: { properties?: Record<string, unknown>; required?: string[] } },
  key: string,
) {
  const required = getRequiredFields(tool);
  expect(required.includes(key)).toBe(true);

  const property = tool.parameters?.properties?.[key] as JsonSchemaProperty | undefined;
  const allowsNull =
    property?.type === "null" ||
    (Array.isArray(property?.type) && property.type.includes("null")) ||
    property?.anyOf?.some((variant) => variant.type === "null") === true;

  expect(allowsNull).toBe(true);
}

function expectRequiredField(
  tool: { parameters?: { required?: string[] } },
  key: string,
) {
  const required = getRequiredFields(tool);
  expect(required.includes(key)).toBe(true);
}

describe("Phase 1 Tool Pack :: shell workflow tools", () => {
  it("[MATRIX:tool:shell_workflows][PACK:schema] publishes strict-compatible nullable required args for optional inputs", () => {
    for (const tool of [
      run_underwriting_workflow,
      run_data_extraction_workflow,
      analyze_market_workflow,
    ]) {
      expect(tool.type).toBe("function");
      expect(tool.strict).toBe(true);
      expect(tool.parameters?.type).toBe("object");
      expect(tool.parameters?.additionalProperties).toBe(false);
      expectRequiredField(tool, "orgId");
    }

    expectRequiredNullableField(run_underwriting_workflow, "model");

    expectRequiredNullableField(run_data_extraction_workflow, "sourceApiUrl");
    expectRequiredNullableField(run_data_extraction_workflow, "model");

    expectRequiredNullableField(analyze_market_workflow, "vacancyRate");
    expectRequiredNullableField(analyze_market_workflow, "marketDataApiUrl");
    expectRequiredNullableField(analyze_market_workflow, "model");
  });

  it("[MATRIX:tool:shell_workflows][PACK:runtime] normalizes nullable tool args before workflow execution", () => {
    const source = readRepoSource("packages/openai/src/tools/shellWorkflowTools.ts");
    expect(source.includes("...(model === null ? {} : { model })")).toBe(true);
    expect(source.includes("...(sourceApiUrl === null ? {} : { sourceApiUrl })")).toBe(true);
    expect(source.includes("vacancyRate: vacancyRate ?? DEFAULT_MARKET_VACANCY_RATE")).toBe(true);
    expect(source.includes("...(marketDataApiUrl === null ? {} : { marketDataApiUrl })")).toBe(true);
  });
});
