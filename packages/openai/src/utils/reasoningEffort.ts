/**
 * Per-task reasoning effort configuration for the OpenAI Responses API.
 * Higher effort = better accuracy but more tokens and latency.
 *
 * NOTE: text.verbosity = "high" for faithful data extraction is planned but
 * not yet wired — the CUA computer tool mode may not support the text parameter.
 * When supported, add to extraction-focused tasks for exact-value transcription.
 */

export type ReasoningEffort = "low" | "medium" | "high";

const EFFORT_BY_RUN_TYPE: Record<string, ReasoningEffort> = {
  screening: "low",
  enrichment: "low",
  chat: "medium",
  browser: "medium",
  deal_analysis: "high",
  parish_pack: "high",
  financial_modeling: "high",
  triage: "medium",
};

/**
 * Get the recommended reasoning effort for a given run type.
 * Defaults to "medium" for unknown run types.
 */
export function getReasoningEffort(runType?: string | null): ReasoningEffort {
  if (!runType) return "medium";
  return EFFORT_BY_RUN_TYPE[runType] ?? "medium";
}
