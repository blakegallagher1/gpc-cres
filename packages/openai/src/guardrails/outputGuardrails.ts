import type { OutputGuardrail } from "@openai/agents";

function outputToText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function detectFinanceRangeViolations(text: string): string[] {
  const violations: string[] = [];

  for (const match of text.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    if (value > 500 || value < -100) {
      violations.push(`percentage_out_of_range:${value}`);
    }
  }

  for (const match of text.matchAll(/(?:irr|internal rate of return)[^0-9-]{0,20}(-?\d+(?:\.\d+)?)/gi)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    if (value > 100 || value < -100) {
      violations.push(`irr_out_of_range:${value}`);
    }
  }

  for (const match of text.matchAll(/dscr[^0-9-]{0,20}(-?\d+(?:\.\d+)?)/gi)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    if (value <= 0 || value > 10) {
      violations.push(`dscr_out_of_range:${value}`);
    }
  }

  return [...new Set(violations)];
}

export function detectLegalAdviceSignals(text: string): string[] {
  const lowered = text.toLowerCase();
  const hasDisclaimer =
    lowered.includes("not legal advice") ||
    lowered.includes("consult an attorney") ||
    lowered.includes("consult your attorney") ||
    lowered.includes("for informational purposes only");

  const signals: string[] = [];

  if (/\b(this is legal advice|i am your attorney|guarantee you will win)\b/i.test(text)) {
    signals.push("explicit_legal_advice_claim");
  }

  const adviceVerb = /\b(you should|you must|i recommend you|file|sue|litigate)\b/i.test(text);
  const legalTerm = /\b(lawsuit|court|litigation|legal claim|statute)\b/i.test(text);
  if (adviceVerb && legalTerm && !hasDisclaimer) {
    signals.push("actionable_legal_advice_without_disclaimer");
  }

  return [...new Set(signals)];
}

export const financeOutputGuardrail: OutputGuardrail = {
  name: "finance_output_guardrail",
  execute: async ({ agentOutput }) => {
    const text = outputToText(agentOutput);
    const violations = detectFinanceRangeViolations(text);

    return {
      tripwireTriggered: violations.length > 0,
      outputInfo: {
        category: "finance_output_validation",
        violations,
      },
    };
  },
};

export const legalOutputGuardrail: OutputGuardrail = {
  name: "legal_output_guardrail",
  execute: async ({ agentOutput }) => {
    const text = outputToText(agentOutput);
    const violations = detectLegalAdviceSignals(text);

    return {
      tripwireTriggered: violations.length > 0,
      outputInfo: {
        category: "legal_output_validation",
        violations,
      },
    };
  },
};
