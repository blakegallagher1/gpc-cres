import { describe, expect, it } from "vitest";

import { AgentReportSchema } from "@entitlement-os/shared/schemas/agentReport";

import { parseFinalOutputJsonObject } from "./executeAgent";

const VALID_REPORT = {
  schema_version: "1.0",
  generated_at: "2025-01-01T00:00:00.000Z",
  task_understanding: {
    summary: "Validate parcel entitlement pathway",
  },
  execution_plan: {
    summary: "Collect evidence and synthesize recommendation",
    steps: [
      {
        agent: "coordinator",
        responsibility: "Coordinate agent calls",
        rationale: "Core flow",
        timeline: "T+1 day",
      },
    ],
  },
  agent_outputs: [
    {
      agent: "coordinator",
      summary: "Analysis complete",
      confidence: 0.91,
    },
  ],
  synthesis: {
    recommendation: "Proceed",
    rationale: "Evidence is sufficient",
    confidence: 0.87,
  },
  key_assumptions: [],
  uncertainty_map: [],
  next_steps: [
    {
      action: "Finalize underwriter packet",
      owner: "Analyst",
      priority: "high",
    },
  ],
  sources: [],
};

describe("parseFinalOutputJsonObject", () => {
  it("extracts fenced JSON reports without requiring fallback normalization", () => {
    const parsed = parseFinalOutputJsonObject(
      `Final normalized report:\n\`\`\`json\n${JSON.stringify(VALID_REPORT)}\n\`\`\``,
    );

    expect(parsed).toEqual(VALID_REPORT);
    expect(AgentReportSchema.safeParse(parsed).success).toBe(true);
  });

  it("returns null for partial JSON fragments so runtime fallback can normalize them", () => {
    const parsed = parseFinalOutputJsonObject(
      '{"schema_version":"1.0","task_understanding":{"summary":"Partial"',
    );

    expect(parsed).toBeNull();
  });

  it("surfaces schema-invalid JSON objects for fallback normalization", () => {
    const parsed = parseFinalOutputJsonObject(
      '{"schema_version":"1.0","generated_at":"2025-01-01T00:00:00.000Z","synthesis":{"recommendation":"Proceed"}}',
    );

    expect(parsed).toEqual({
      schema_version: "1.0",
      generated_at: "2025-01-01T00:00:00.000Z",
      synthesis: {
        recommendation: "Proceed",
      },
    });
    expect(AgentReportSchema.safeParse(parsed).success).toBe(false);
  });
});
