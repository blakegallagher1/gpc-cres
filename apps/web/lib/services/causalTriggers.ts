import "server-only";

import { computeConfidenceVector, type ConfidenceVector } from "./confidenceScoring";
import { computeAnomalyScore } from "./anomalyDetector";
import { computePromotionScore } from "./promotionScoring";
import { computeDynamicThreshold } from "./dynamicThreshold";
import { explainPromotionDecision, type PromotionDecision } from "./promotionExplainer";
import { propagateCausalImpact, type PropagationResult } from "./causalPropagation";
import { factTypeToDomain } from "./causalDag";

/**
 * Causal trigger safety layer.
 *
 * Orchestrates the full pipeline for a memory write:
 * 1. Compute confidence vector (5 dimensions)
 * 2. Compute anomaly score
 * 3. Compute promotion score
 * 4. Compute dynamic threshold
 * 5. Make promotion decision
 * 6. If promoted and in a causal domain, trigger downstream propagation
 *
 * This is the single entry point that the write gate should call
 * after successful schema validation and conflict detection.
 */

export interface TriggerResult {
  confidenceVector: ConfidenceVector;
  promotionDecision: PromotionDecision;
  propagation: PropagationResult | null;
}

export async function evaluateMemoryWrite(context: {
  orgId: string;
  entityId: string;
  factType: string;
  sourceType: string;
  payloadJson: Record<string, unknown>;
  economicWeight: number;
  volatilityClass: string;
  eventLogId: string;
}): Promise<TriggerResult> {
  // 1. Confidence vector (4 dimensions computed, anomaly added below)
  const vector = await computeConfidenceVector({
    orgId: context.orgId,
    entityId: context.entityId,
    factType: context.factType,
    sourceType: context.sourceType,
    payloadJson: context.payloadJson,
    economicWeight: context.economicWeight,
  });

  // 2. Anomaly score
  const anomalyScore = await computeAnomalyScore({
    orgId: context.orgId,
    entityId: context.entityId,
    factType: context.factType,
    payload: context.payloadJson,
  });
  vector.anomaly_score = anomalyScore;

  // 3. Promotion score
  const promotion = computePromotionScore(vector);

  // 4. Dynamic threshold
  const thresholdResult = await computeDynamicThreshold({
    orgId: context.orgId,
    entityId: context.entityId,
    volatilityClass: context.volatilityClass,
  });

  // 5. Promotion decision
  const decision = explainPromotionDecision(vector, promotion, thresholdResult);

  // 6. Causal propagation (only if promoted and in a causal domain)
  let propagation: PropagationResult | null = null;

  if (decision.promoted) {
    const domain = factTypeToDomain(context.factType);
    if (domain) {
      // Impact delta is based on how much the confidence vector changed
      // Use economic weight as a proxy for significance
      propagation = await propagateCausalImpact(
        context.orgId,
        context.entityId,
        context.eventLogId,
        context.factType,
        context.economicWeight,
      );
    }
  }

  return {
    confidenceVector: vector,
    promotionDecision: decision,
    propagation,
  };
}
