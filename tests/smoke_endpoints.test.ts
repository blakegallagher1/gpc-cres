import { describe, expect, it } from "vitest";

import {
  assessSemanticRecallPayload,
  unwrapToolExecuteResult,
} from "../scripts/smoke_endpoints.ts";

describe("smoke_endpoints semantic recall parsing", () => {
  it("unwraps the route result envelope", () => {
    const payload = {
      result: {
        results: [{ parcelId: "1" }],
        count: 1,
      },
      metadata: {
        toolName: "recall_property_intelligence",
      },
    };

    expect(unwrapToolExecuteResult(payload)).toEqual(payload.result);
  });

  it("treats wrapped semantic hits as success", () => {
    const assessment = assessSemanticRecallPayload({
      result: {
        results: [{ parcelId: "1", score: 0.82 }],
        count: 1,
      },
    });

    expect(assessment.ok).toBe(true);
    expect(assessment.hits).toHaveLength(1);
    expect(assessment.error).toBeUndefined();
  });

  it("reports wrapped tool execution errors instead of misclassifying them as zero hits", () => {
    const assessment = assessSemanticRecallPayload({
      result: "An error occurred while running the tool. Please try again. Error: $: Invalid JSON input for tool",
      metadata: {
        toolName: "recall_property_intelligence",
      },
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.hits).toEqual([]);
    expect(assessment.error).toContain("Invalid JSON input for tool");
  });

  it("surfaces memory-disabled responses explicitly", () => {
    const assessment = assessSemanticRecallPayload({
      result: {
        results: [],
        count: 0,
        memory_disabled: true,
        note: "Property intelligence memory is not enabled.",
      },
    });

    expect(assessment.ok).toBe(false);
    expect(assessment.memoryDisabled).toBe(true);
    expect(assessment.error).toContain("Property intelligence memory is not enabled");
  });
});
