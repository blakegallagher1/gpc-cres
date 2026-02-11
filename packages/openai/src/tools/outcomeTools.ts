import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * get_historical_accuracy — Finance agent references past assumption biases
 * and triage calibration to adjust pro forma projections.
 */
export const get_historical_accuracy = tool({
  name: "get_historical_accuracy",
  description:
    "Retrieve historical accuracy data showing systematic biases in past projections " +
    "(e.g., consistently overestimating rent growth or underestimating construction costs). " +
    "Also includes triage tier calibration showing how triage recommendations correlated with actual outcomes. " +
    "Use this when building new pro formas to apply bias corrections.",
  parameters: z.object({
    include_calibration: z
      .boolean()
      .nullable()
      .describe("Whether to include triage calibration data (default true)."),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _historicalAccuracy: true,
      includeCalibration: params.include_calibration ?? true,
    });
  },
});
