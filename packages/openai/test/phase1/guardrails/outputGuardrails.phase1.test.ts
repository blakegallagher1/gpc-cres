import { describe, expect, it } from "vitest";

import {
  detectFinanceRangeViolations,
  detectLegalAdviceSignals,
  financeOutputGuardrail,
  legalOutputGuardrail,
} from "../../../src/guardrails/outputGuardrails.js";

describe("Phase 1 Guardrails :: output", () => {
  it("[MATRIX:guardrail:output-finance][PACK:range] flags out-of-range finance metrics", () => {
    const violations = detectFinanceRangeViolations(
      "IRR 250 and DSCR -1 and return 800%",
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("[MATRIX:guardrail:output-legal][PACK:advice] flags actionable legal advice without disclaimer", () => {
    const violations = detectLegalAdviceSignals(
      "You should file a lawsuit in court immediately.",
    );
    expect(violations).toContain("actionable_legal_advice_without_disclaimer");
  });

  it("[MATRIX:guardrail:output][PACK:wiring] exposes named output guardrails", () => {
    expect(financeOutputGuardrail.name).toBe("finance_output_guardrail");
    expect(typeof financeOutputGuardrail.execute).toBe("function");
    expect(legalOutputGuardrail.name).toBe("legal_output_guardrail");
    expect(typeof legalOutputGuardrail.execute).toBe("function");
  });
});
