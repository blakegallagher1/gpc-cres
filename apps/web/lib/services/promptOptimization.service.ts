import "server-only";

/**
 * Closed-loop prompt optimization service (P1 Pattern 31).
 * When agent runs score below threshold, generates targeted prompt patches
 * to address specific grader failures. Patches are stored as procedural
 * skills for future runs.
 */

import type { GraderResult } from "./agentGraders.service";

export type PromptPatch = {
  agentId: string;
  version: number;
  originalPromptHash: string;
  patchDescription: string;
  patchedInstructions: string;
  triggerScores: GraderResult[];
  createdAt: string;
};

export type OptimizationResult = {
  attempted: boolean;
  improved: boolean;
  patch: PromptPatch | null;
  reason: string;
};

const MAX_OPTIMIZATION_RETRIES = 3;
const OPTIMIZATION_THRESHOLD = 0.7; // Below this avg score, attempt optimization

/**
 * Determine if a run's grader scores warrant prompt optimization.
 */
export function shouldOptimize(avgScore: number, lenientPass: boolean): boolean {
  return !lenientPass && avgScore < OPTIMIZATION_THRESHOLD;
}

/**
 * Build a metaprompt that instructs GPT to improve the agent's instructions
 * based on specific grader failures.
 */
export function buildMetaprompt(options: {
  currentPrompt: string;
  failedGraders: GraderResult[];
  runOutput: string;
  taskDescription: string;
}): string {
  const { currentPrompt, failedGraders, runOutput, taskDescription } = options;

  const failureSummary = failedGraders
    .map((g) => `- ${g.name}: score ${g.score.toFixed(2)} — ${g.feedback}`)
    .join("\n");

  return [
    "You are an expert prompt engineer. Your task is to improve an AI agent's system prompt",
    "based on specific quality failures identified by automated graders.",
    "",
    "## Current System Prompt",
    currentPrompt.slice(0, 2000),
    "",
    "## Task That Was Attempted",
    taskDescription.slice(0, 500),
    "",
    "## Agent Output (truncated)",
    runOutput.slice(0, 1000),
    "",
    "## Grader Failures",
    failureSummary,
    "",
    "## Instructions",
    "Write an improved version of the system prompt that addresses the specific failures above.",
    "Focus on:",
    "- Adding explicit instructions for the failing dimensions",
    "- Being more specific about expected output format and completeness",
    "- Adding guardrails that prevent the identified failure modes",
    "",
    "Return ONLY the improved system prompt text, nothing else.",
  ].join("\n");
}

/**
 * Extract failed graders from a score set.
 */
export function extractFailedGraders(scores: GraderResult[]): GraderResult[] {
  return scores.filter((s) => !s.passed);
}

/**
 * Build a prompt patch record from optimization results.
 */
export function buildPromptPatch(options: {
  agentId: string;
  version: number;
  originalPromptHash: string;
  patchedInstructions: string;
  triggerScores: GraderResult[];
}): PromptPatch {
  return {
    agentId: options.agentId,
    version: options.version,
    originalPromptHash: options.originalPromptHash,
    patchDescription: `Auto-optimization triggered by grader failures: ${options.triggerScores.map((s) => s.name).join(", ")}`,
    patchedInstructions: options.patchedInstructions,
    triggerScores: options.triggerScores,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if max optimization retries have been exhausted for a given agent+task combo.
 */
export function isRetryExhausted(attemptCount: number): boolean {
  return attemptCount >= MAX_OPTIMIZATION_RETRIES;
}
