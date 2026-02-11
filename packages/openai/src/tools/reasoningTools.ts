import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Reasoning tools — meta-cognitive capabilities for agents.
 *
 * These tools move the system toward AGI by providing structured
 * reasoning primitives: hypothesis testing, uncertainty quantification,
 * assumption tracking, and strategic replanning. They encourage agents
 * to reason about their own reasoning (metacognition) rather than
 * simply producing outputs.
 */

/**
 * log_reasoning_trace — records the agent's chain-of-thought for
 * a specific analysis step, enabling audit trails and learning.
 */
export const log_reasoning_trace = tool({
  name: "log_reasoning_trace",
  description:
    "Record your reasoning chain for a specific analysis step. Use this to document " +
    "WHY you reached a conclusion, what alternatives you considered, and what would " +
    "change your mind. This enables the system to learn from reasoning patterns and " +
    "helps other agents understand the basis for your findings.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID this reasoning relates to."),
    step: z
      .string()
      .describe("Short label for this reasoning step (e.g., 'flood_risk_assessment')."),
    hypothesis: z
      .string()
      .describe("The hypothesis or question being evaluated."),
    evidence_for: z
      .array(z.string())
      .describe("Evidence supporting the hypothesis."),
    evidence_against: z
      .array(z.string())
      .describe("Evidence contradicting or weakening the hypothesis."),
    conclusion: z
      .string()
      .describe("Your conclusion based on weighing the evidence."),
    confidence: z
      .number()
      .describe("Confidence in this conclusion (0.0 to 1.0)."),
    assumptions: z
      .array(z.string())
      .describe("Key assumptions underlying this conclusion that could be wrong."),
    invalidation_triggers: z
      .array(z.string())
      .nullable()
      .describe(
        "Specific conditions that would invalidate this conclusion " +
        "and require re-analysis. Pass null if none identified."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _reasoningTrace: true,
      dealId: params.deal_id,
      step: params.step,
      hypothesis: params.hypothesis,
      evidenceFor: params.evidence_for,
      evidenceAgainst: params.evidence_against,
      conclusion: params.conclusion,
      confidence: params.confidence,
      assumptions: params.assumptions,
      invalidationTriggers: params.invalidation_triggers ?? [],
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * assess_uncertainty — quantifies what the agent doesn't know and
 * what information would most reduce uncertainty.
 */
export const assess_uncertainty = tool({
  name: "assess_uncertainty",
  description:
    "Quantify the uncertainty in your current analysis and identify what information " +
    "would most reduce it. Use this before making final recommendations to ensure " +
    "you've identified the key unknowns. This drives autonomous information-seeking " +
    "behavior — the system can then prioritize gathering the most impactful missing data.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID this assessment relates to."),
    analysis_area: z
      .string()
      .describe("The domain being analyzed (e.g., 'financial_viability', 'entitlement_risk')."),
    known_facts: z
      .array(z.string())
      .describe("Facts that are established with high confidence."),
    unknown_factors: z
      .array(
        z.object({
          factor: z.string().describe("The unknown factor."),
          impact: z
            .enum(["critical", "high", "medium", "low"])
            .describe("How much this unknown affects the conclusion."),
          reducible: z
            .boolean()
            .describe("Whether this uncertainty can be reduced with more data/research."),
          suggested_action: z
            .string()
            .nullable()
            .describe("What action would reduce this uncertainty."),
        })
      )
      .describe("Factors that are unknown or uncertain."),
    overall_confidence: z
      .number()
      .describe("Overall confidence in the analysis given current unknowns (0.0 to 1.0)."),
    recommendation_robustness: z
      .enum(["robust", "sensitive", "fragile"])
      .describe(
        "How sensitive the recommendation is to the unknowns. " +
        "'robust' = conclusion holds regardless. " +
        "'sensitive' = might change with new info. " +
        "'fragile' = likely to change."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _uncertaintyAssessment: true,
      dealId: params.deal_id,
      analysisArea: params.analysis_area,
      knownFacts: params.known_facts,
      unknownFactors: params.unknown_factors,
      overallConfidence: params.overall_confidence,
      recommendationRobustness: params.recommendation_robustness,
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * request_reanalysis — signals that new information invalidates
 * a previous conclusion and requests targeted re-analysis.
 */
export const request_reanalysis = tool({
  name: "request_reanalysis",
  description:
    "Signal that new information has been discovered that may invalidate a previous " +
    "analysis conclusion, and request targeted re-analysis from the appropriate agent. " +
    "Use this when your findings contradict or significantly modify another agent's " +
    "earlier conclusions. This enables iterative refinement and self-correction.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID this request relates to."),
    target_agent: z
      .string()
      .describe("The agent whose analysis should be re-evaluated."),
    original_conclusion: z
      .string()
      .describe("The previous conclusion that may need revision."),
    new_information: z
      .string()
      .describe("The new information that challenges the original conclusion."),
    suggested_focus: z
      .string()
      .describe("What specific aspect should the re-analysis focus on."),
    urgency: z
      .enum(["blocking", "important", "informational"])
      .describe(
        "How urgently re-analysis is needed. " +
        "'blocking' = deal decision cannot proceed without it. " +
        "'important' = should be done before final recommendation. " +
        "'informational' = nice to have but not critical."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _reanalysisRequest: true,
      dealId: params.deal_id,
      targetAgent: params.target_agent,
      originalConclusion: params.original_conclusion,
      newInformation: params.new_information,
      suggestedFocus: params.suggested_focus,
      urgency: params.urgency,
      timestamp: new Date().toISOString(),
    });
  },
});
