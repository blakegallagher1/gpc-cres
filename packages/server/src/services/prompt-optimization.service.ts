import type { GraderResult } from "./agent-graders.service";

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
const OPTIMIZATION_THRESHOLD = 0.7;

export function shouldOptimize(
  avgScore: number,
  lenientPass: boolean,
): boolean {
  return !lenientPass && avgScore < OPTIMIZATION_THRESHOLD;
}

export function buildMetaprompt(options: {
  currentPrompt: string;
  failedGraders: GraderResult[];
  runOutput: string;
  taskDescription: string;
}): string {
  const failureSummary = options.failedGraders
    .map(
      (grader) =>
        `- ${grader.name}: score ${grader.score.toFixed(2)} — ${grader.feedback}`,
    )
    .join("\n");

  return [
    "You are an expert prompt engineer. Your task is to improve an AI agent's system prompt",
    "based on specific quality failures identified by automated graders.",
    "",
    "## Current System Prompt",
    options.currentPrompt.slice(0, 2000),
    "",
    "## Task That Was Attempted",
    options.taskDescription.slice(0, 500),
    "",
    "## Agent Output (truncated)",
    options.runOutput.slice(0, 1000),
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

export function extractFailedGraders(scores: GraderResult[]): GraderResult[] {
  return scores.filter((score) => !score.passed);
}

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
    patchDescription: `Auto-optimization triggered by grader failures: ${options.triggerScores.map((score) => score.name).join(", ")}`,
    patchedInstructions: options.patchedInstructions,
    triggerScores: options.triggerScores,
    createdAt: new Date().toISOString(),
  };
}

export function isRetryExhausted(attemptCount: number): boolean {
  return attemptCount >= MAX_OPTIMIZATION_RETRIES;
}
