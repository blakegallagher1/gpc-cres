import { describe, expect, it } from "vitest";

import {
  buildAgentEvalReport,
  GOLDEN_OPERATOR_EVAL_CASES,
  parseAgentStream,
  scoreAgentEvalCase,
  type AgentEvalTranscript,
} from "./golden_operator_workflows";

function transcript(overrides: Partial<AgentEvalTranscript> = {}): AgentEvalTranscript {
  return {
    text: "East Baton Rouge property database evidence shows parcel risk and action items. Memory conflict evidence is flagged.",
    events: [
      { type: "tool_start", toolName: "query_property_db_sql" },
      { type: "tool_end", toolName: "query_property_db_sql" },
      { type: "done" },
    ],
    durationMs: 100,
    httpStatus: 200,
    error: null,
    ...overrides,
  };
}

describe("golden operator workflow evals", () => {
  it("parses JSON and SSE-style agent stream events", () => {
    const events = parseAgentStream(
      [
        'event: {"type":"tool_start","toolName":"query_property_db_sql"}',
        'data: {"type":"text_delta","text":"East Baton Rouge evidence"}',
        'data: {"type":"done"}',
      ].join("\n"),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "tool_start", toolName: "query_property_db_sql" }),
      expect.objectContaining({ type: "text_delta", text: "East Baton Rouge evidence" }),
      expect.objectContaining({ type: "done" }),
    ]);
  });

  it("passes a workflow when required signals, tools, and events are present", () => {
    const result = scoreAgentEvalCase(GOLDEN_OPERATOR_EVAL_CASES[0], transcript(), "fixture");

    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.severity).toBe("info");
  });

  it("fails with error severity in live mode when tool evidence is missing", () => {
    const result = scoreAgentEvalCase(
      GOLDEN_OPERATOR_EVAL_CASES[0],
      transcript({ events: [{ type: "done" }] }),
      "live",
    );

    expect(result.status).toBe("fail");
    expect(result.severity).toBe("error");
    expect(result.checks.find((check) => check.name === "tool:query_property_db_sql")?.passed).toBe(false);
  });

  it("builds a report with pass/fail totals", () => {
    const pass = scoreAgentEvalCase(GOLDEN_OPERATOR_EVAL_CASES[0], transcript(), "fixture");
    const fail = scoreAgentEvalCase(
      GOLDEN_OPERATOR_EVAL_CASES[1],
      transcript({ httpStatus: 500, error: "server error" }),
      "fixture",
    );

    const report = buildAgentEvalReport(
      [pass, fail],
      { mode: "fixture", baseUrl: null, websocketTransport: false },
      250,
    );

    expect(report.ok).toBe(false);
    expect(report.caseCount).toBe(2);
    expect(report.passCount).toBe(1);
    expect(report.failCount).toBe(1);
  });
});
