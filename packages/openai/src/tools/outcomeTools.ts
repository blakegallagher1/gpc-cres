import { tool } from "@openai/agents";
import { z } from "zod";
import {
  buildOutcomeTrackingSummary,
  type OutcomeRecord,
  type OutcomeTrackingSummary,
} from "@entitlement-os/shared";

/**
 * get_historical_accuracy — Finance agent references past assumption biases
 * and triage calibration to adjust pro forma projections.
 *
 * Enhanced: Now computes real adaptive weight adjustments and projection
 * bias corrections from historical outcome data, enabling the system to
 * learn from past decisions and self-correct.
 */
export const get_historical_accuracy = tool({
  name: "get_historical_accuracy",
  description:
    "Retrieve historical accuracy data showing systematic biases in past projections " +
    "(e.g., consistently overestimating rent growth or underestimating construction costs). " +
    "Also includes triage tier calibration showing how triage recommendations correlated with actual outcomes, " +
    "and adaptive weight adjustments that improve scoring accuracy over time. " +
    "Use this when building new pro formas to apply bias corrections, and when evaluating " +
    "triage scores to understand how reliable each confidence tier has been historically.",
  parameters: z.object({
    include_calibration: z
      .boolean()
      .nullable()
      .describe("Whether to include triage calibration data (default true)."),
    include_weight_adaptation: z
      .boolean()
      .nullable()
      .describe("Whether to include adaptive weight adjustments based on outcomes (default true)."),
  }),
  execute: async (params) => {
    // Server-side implementation will query the database for actual outcome records.
    // This tool returns structured data that the API route handler resolves.
    return JSON.stringify({
      _historicalAccuracy: true,
      includeCalibration: params.include_calibration ?? true,
      includeWeightAdaptation: params.include_weight_adaptation ?? true,
    });
  },
});

/**
 * Record a deal outcome for future learning.
 * This closes the feedback loop by capturing what actually happened
 * vs. what was predicted, enabling the adaptive scoring system.
 */
export const record_deal_outcome = tool({
  name: "record_deal_outcome",
  description:
    "Record the actual outcome of a deal that was previously scored/triaged. " +
    "This closes the feedback loop between predictions and reality, enabling " +
    "the system to learn from experience. Record outcomes when a deal reaches " +
    "a terminal state (closed successfully, abandoned, or failed). Also record " +
    "projection accuracy for specific financial metrics.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID whose outcome is being recorded."),
    actual_outcome: z
      .enum(["SUCCESS", "PARTIAL", "FAILURE"])
      .describe(
        "The actual outcome. SUCCESS = deal closed profitably as projected. " +
        "PARTIAL = deal closed but with significant deviation from projections. " +
        "FAILURE = deal abandoned or resulted in loss."
      ),
    outcome_notes: z
      .string()
      .nullable()
      .describe("Free-text notes on what drove the outcome."),
    projection_actuals: z
      .array(
        z.object({
          metric: z
            .string()
            .describe(
              "The metric name (e.g., 'rent_growth', 'construction_cost', 'noi', 'exit_cap_rate')."
            ),
          predicted: z
            .number()
            .describe("The value that was projected/predicted."),
          actual: z
            .number()
            .describe("The actual value observed."),
        })
      )
      .nullable()
      .describe(
        "Specific projection vs actual comparisons for financial metrics. " +
        "Pass null if no specific metric comparisons are available."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _recordOutcome: true,
      dealId: params.deal_id,
      actualOutcome: params.actual_outcome,
      outcomeNotes: params.outcome_notes ?? null,
      projectionActuals: params.projection_actuals ?? [],
      timestamp: new Date().toISOString(),
    });
  },
});

// Re-export types for use in API routes
export type { OutcomeRecord, OutcomeTrackingSummary };
export { buildOutcomeTrackingSummary };
