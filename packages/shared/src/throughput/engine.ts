import { hashJsonSha256 } from "../crypto/sha256.js";

export type ComplexityClass = "low" | "medium" | "high";
export type ConfidenceClass = "high" | "medium" | "low";
export type TaskSlaTier = "fast-triage" | "standard" | "deep-diligence";

export type ThroughputRouting = {
  complexityClass: ComplexityClass;
  confidenceClass: ConfidenceClass;
  slaTier: TaskSlaTier;
  queueName: string;
  rationale: string;
};

export type TriageSignalInput = {
  parcelCount: number;
  avgRiskScore: number;
  disqualifierCount: number;
  confidence: number;
  missingDataCount: number;
};

export type DeterministicRerunDecision = {
  inputHash: string;
  shouldReuse: boolean;
  reason: string;
};

const SLA_DUE_DAYS: Record<TaskSlaTier, Record<number, number>> = {
  "fast-triage": {
    1: 1,
    2: 2,
    3: 3,
    4: 5,
    5: 6,
    6: 7,
    7: 9,
    8: 10,
  },
  standard: {
    1: 2,
    2: 4,
    3: 7,
    4: 10,
    5: 14,
    6: 18,
    7: 24,
    8: 30,
  },
  "deep-diligence": {
    1: 3,
    2: 7,
    3: 12,
    4: 18,
    5: 25,
    6: 35,
    7: 45,
    8: 60,
  },
};

export function classifyComplexity(input: TriageSignalInput): ComplexityClass {
  if (
    input.parcelCount >= 4 ||
    input.avgRiskScore >= 7.5 ||
    input.disqualifierCount >= 3 ||
    input.missingDataCount >= 3
  ) {
    return "high";
  }

  if (
    input.parcelCount >= 2 ||
    input.avgRiskScore >= 5.0 ||
    input.disqualifierCount >= 1 ||
    input.missingDataCount >= 1
  ) {
    return "medium";
  }

  return "low";
}

export function classifyConfidence(confidence: number): ConfidenceClass {
  if (confidence >= 0.75) {
    return "high";
  }

  if (confidence >= 0.55) {
    return "medium";
  }

  return "low";
}

export function computeThroughputRouting(input: TriageSignalInput): ThroughputRouting {
  const complexityClass = classifyComplexity(input);
  const confidenceClass = classifyConfidence(input.confidence);

  if (complexityClass === "high" || confidenceClass === "low") {
    return {
      complexityClass,
      confidenceClass,
      slaTier: "deep-diligence",
      queueName: "entitlement-os.deep-diligence",
      rationale: "High complexity or low confidence requires deeper review lane.",
    };
  }

  if (complexityClass === "low" && confidenceClass === "high") {
    return {
      complexityClass,
      confidenceClass,
      slaTier: "fast-triage",
      queueName: "entitlement-os.fast-triage",
      rationale: "Low complexity with high confidence qualifies for accelerated queue.",
    };
  }

  return {
    complexityClass,
    confidenceClass,
    slaTier: "standard",
    queueName: "entitlement-os.standard",
    rationale: "Balanced complexity/confidence routes through standard queue.",
  };
}

export function computeTaskDueAt(
  createdAt: Date,
  pipelineStep: number,
  slaTier: TaskSlaTier,
): Date {
  const byStep = SLA_DUE_DAYS[slaTier];
  const dueInDays = byStep[pipelineStep] ?? byStep[8];

  const due = new Date(createdAt.getTime());
  due.setUTCDate(due.getUTCDate() + dueInDays);
  return due;
}

export function buildDeterministicRerunDecision(params: {
  runType: string;
  dealId: string;
  orgId: string;
  payload: unknown;
  previousInputHash?: string | null;
  forceRerun?: boolean;
}): DeterministicRerunDecision {
  const inputHash = hashJsonSha256({
    runType: params.runType,
    dealId: params.dealId,
    orgId: params.orgId,
    payload: params.payload,
  });

  if (params.forceRerun) {
    return {
      inputHash,
      shouldReuse: false,
      reason: "force_rerun_requested",
    };
  }

  if (params.previousInputHash && params.previousInputHash === inputHash) {
    return {
      inputHash,
      shouldReuse: true,
      reason: "input_hash_match",
    };
  }

  return {
    inputHash,
    shouldReuse: false,
    reason: params.previousInputHash ? "input_hash_changed" : "no_prior_hash",
  };
}
