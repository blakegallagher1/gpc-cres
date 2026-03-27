import "server-only";

export type GraderResult = {
  name: string;
  score: number; // 0-1
  passed: boolean;
  feedback: string;
};

export type AggregateGradeResult = {
  scores: GraderResult[];
  avgScore: number;
  lenientPass: boolean;
  explanation: string;
};

const LENIENT_PASS_RATIO = 0.75;
const LENIENT_AVERAGE_THRESHOLD = 0.85;

/**
 * Grade data completeness — did the run return all expected fields?
 */
export function gradeDataCompleteness(output: {
  expectedFields: string[];
  returnedFields: string[];
}): GraderResult {
  if (output.expectedFields.length === 0) {
    return { name: "data_completeness", score: 1, passed: true, feedback: "No fields expected" };
  }
  const found = output.returnedFields.filter((f) => output.expectedFields.includes(f));
  const score = found.length / output.expectedFields.length;
  const missing = output.expectedFields.filter((f) => !output.returnedFields.includes(f));
  return {
    name: "data_completeness",
    score,
    passed: score >= 0.8,
    feedback: missing.length > 0 ? `Missing fields: ${missing.join(", ")}` : "All fields present",
  };
}

/**
 * Grade cost efficiency — how many turns/tokens vs baseline?
 */
export function gradeCostEfficiency(output: {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  baselineTurns?: number;
  baselineTokens?: number;
}): GraderResult {
  const baselineTurns = output.baselineTurns ?? 10;
  const baselineTokens = output.baselineTokens ?? 50000;
  const totalTokens = output.inputTokens + output.outputTokens;
  const turnRatio = Math.min(1, baselineTurns / Math.max(1, output.turns));
  const tokenRatio = Math.min(1, baselineTokens / Math.max(1, totalTokens));
  const score = (turnRatio + tokenRatio) / 2;
  return {
    name: "cost_efficiency",
    score,
    passed: score >= 0.6,
    feedback: `${output.turns} turns, ${totalTokens} tokens (baseline: ${baselineTurns} turns, ${baselineTokens} tokens)`,
  };
}

/**
 * Grade citation quality — are facts traceable to sources?
 */
export function gradeCitationQuality(output: {
  totalClaims: number;
  citedClaims: number;
}): GraderResult {
  if (output.totalClaims === 0) {
    return { name: "citation_quality", score: 1, passed: true, feedback: "No claims to cite" };
  }
  const score = output.citedClaims / output.totalClaims;
  return {
    name: "citation_quality",
    score,
    passed: score >= 0.7,
    feedback: `${output.citedClaims}/${output.totalClaims} claims cited`,
  };
}

/**
 * Grade task success — did the run achieve its stated goal?
 */
export function gradeTaskSuccess(output: {
  succeeded: boolean;
  partialCredit?: number; // 0-1 for partial success
}): GraderResult {
  const score = output.succeeded ? 1 : (output.partialCredit ?? 0);
  return {
    name: "task_success",
    score,
    passed: output.succeeded,
    feedback: output.succeeded ? "Task completed successfully" : `Task failed (partial credit: ${(score * 100).toFixed(0)}%)`,
  };
}

/**
 * Aggregate grader results with lenient-pass consensus.
 * Pass if 75% of graders pass OR average score exceeds 0.85.
 */
export function evaluateConsensus(scores: GraderResult[]): AggregateGradeResult {
  if (scores.length === 0) {
    return { scores: [], avgScore: 0, lenientPass: false, explanation: "No graders ran" };
  }
  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const passCount = scores.filter((s) => s.passed).length;
  const passRatio = passCount / scores.length;
  const majorityPass = passRatio >= LENIENT_PASS_RATIO;
  const thresholdPass = avgScore >= LENIENT_AVERAGE_THRESHOLD;
  const lenientPass = majorityPass || thresholdPass;
  const explanation = majorityPass
    ? `${passCount}/${scores.length} graders passed (${(passRatio * 100).toFixed(0)}%)`
    : thresholdPass
      ? `Average score ${avgScore.toFixed(2)} exceeds threshold ${LENIENT_AVERAGE_THRESHOLD}`
      : `Only ${passCount}/${scores.length} passed, avg ${avgScore.toFixed(2)} below ${LENIENT_AVERAGE_THRESHOLD}`;
  return { scores, avgScore, lenientPass, explanation };
}
