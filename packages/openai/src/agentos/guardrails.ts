import type { InputGuardrail, OutputGuardrail } from "@openai/agents";

import { isAgentOsFeatureEnabled } from "./config.js";

// ---------------------------------------------------------------------------
// PII patterns (shared between policy engine and guardrails)
// ---------------------------------------------------------------------------

const PII_PATTERNS: { regex: RegExp; label: string; redaction: string }[] = [
  { regex: /\d{3}-\d{2}-\d{4}/g, label: "SSN", redaction: "[REDACTED-SSN]" },
  { regex: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g, label: "Credit Card", redaction: "[REDACTED-CC]" },
];

// ---------------------------------------------------------------------------
// SQL Injection patterns
// ---------------------------------------------------------------------------

const SQL_INJECTION_PATTERNS = [
  /(\b|')OR\s+1\s*=\s*1/i,
  /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\b/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /'\s*;\s*--/,
  /\bexec\s*\(/i,
  /\bxp_cmdshell\b/i,
  /\bwaitfor\s+delay\b/i,
  /\bsleep\s*\(\s*\d/i,
  /\binto\s+outfile\b/i,
  /\bload_file\s*\(/i,
];

function normalizeInputText(input: string | unknown[]): string {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
  return input
    .map((item) => {
      if (typeof item === "string") return item;
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(" ");
}

function outputToText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// 2D-1: SQL Injection Input Guardrail
// ---------------------------------------------------------------------------

export function detectSqlInjectionSignals(text: string): string[] {
  return SQL_INJECTION_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => `sql_injection:${pattern.source}`);
}

/**
 * Complements the existing coordinatorInputGuardrail.
 * Detects SQL injection patterns in tool inputs.
 */
export const sqlInjectionGuardrail: InputGuardrail = {
  name: "sql_injection_guardrail",
  runInParallel: true,
  execute: async ({ input }) => {
    const text = normalizeInputText(input);
    const signals = detectSqlInjectionSignals(text);

    return {
      tripwireTriggered: signals.length > 0,
      outputInfo: {
        category: "sql_injection_detection",
        signals,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2D-2: PII Redaction Output Guardrail
// ---------------------------------------------------------------------------

export function detectAndRedactPii(text: string): { cleaned: string; found: string[] } {
  let cleaned = text;
  const found: string[] = [];

  for (const pattern of PII_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      found.push(`${pattern.label}:${matches.length}`);
      cleaned = cleaned.replace(pattern.regex, pattern.redaction);
    }
  }

  return { cleaned, found };
}

/**
 * Scans agent output for PII before returning to user.
 * Trips the guardrail if PII is found (logging only — does not block output
 * because the SDK fires tripwire exceptions). Use `detectAndRedactPii` in
 * post-processing to actually scrub the text.
 */
export const piiRedactionGuardrail: OutputGuardrail = {
  name: "pii_redaction_guardrail",
  execute: async ({ agentOutput }) => {
    const text = outputToText(agentOutput);
    const { found } = detectAndRedactPii(text);

    return {
      tripwireTriggered: found.length > 0,
      outputInfo: {
        category: "pii_redaction",
        piiFound: found,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2D-3: Cost Guardrail
// ---------------------------------------------------------------------------

let _runCostAccumulator = 0;
const _costThreshold =
  Number(process.env.AGENTOS_RUN_COST_WARNING_THRESHOLD) || 5;

export function addRunCost(cost: number): void {
  _runCostAccumulator += cost;
}

export function resetRunCost(): void {
  _runCostAccumulator = 0;
}

export function getRunCost(): number {
  return _runCostAccumulator;
}

/**
 * Trips when cumulative run cost exceeds the configured threshold.
 * Does not block output — just flags it so the caller can append a warning.
 */
export const costGuardrail: OutputGuardrail = {
  name: "cost_guardrail",
  execute: async () => {
    const overBudget =
      isAgentOsFeatureEnabled("costTracking") &&
      _runCostAccumulator > _costThreshold;

    return {
      tripwireTriggered: overBudget,
      outputInfo: {
        category: "cost_warning",
        runCostUsd: _runCostAccumulator,
        thresholdUsd: _costThreshold,
      },
    };
  },
};
