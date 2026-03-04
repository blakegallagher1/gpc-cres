import { tool } from "@openai/agents";
import { z } from "zod";

import {
  runUnderwritingWorkflow,
  UnderwritingWorkflowInputSchema,
  UnderwritingWorkflowResultSchema,
} from "../shell-workflows/underwriting-workflow.js";
import {
  runDataExtractionWorkflow,
  DataExtractionWorkflowInputSchema,
  DataExtractionWorkflowResultSchema,
} from "../shell-workflows/data-extraction-workflow.js";
import {
  runMarketAnalysisWorkflow,
  MarketAnalysisWorkflowInputSchema,
  MarketAnalysisWorkflowResultSchema,
} from "../shell-workflows/market-analysis-workflow.js";

const runWorkflowResult = {
  withMetadata: <T extends Record<string, unknown>>(orgId: string, result: T) => {
    return JSON.stringify({ ...result, orgId, executionMode: "shell" });
  },
};

const orgIdSchema = z.string().describe("The org ID for security scoping");

export const run_underwriting_workflow = tool({
  name: "run_underwriting_workflow",
  description:
    "Run a deterministic, shell-backed underwriting calculation that returns DSCR and implied value from key financial inputs.",
  parameters: UnderwritingWorkflowInputSchema.extend({
    orgId: orgIdSchema,
  }),
  execute: async ({ orgId, model, ...input }) => {
    const result = await runUnderwritingWorkflow({
      ...input,
      model,
    });
    const validated = UnderwritingWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});

export const run_data_extraction_workflow = tool({
  name: "run_data_extraction_workflow",
  description:
    "Run a shell-backed text extraction workflow with regex rules and optional network validation checks.",
  parameters: DataExtractionWorkflowInputSchema.extend({
    orgId: orgIdSchema,
  }),
  execute: async ({ orgId, model, ...input }) => {
    const result = await runDataExtractionWorkflow({
      ...input,
      model,
    });
    const validated = DataExtractionWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});

export const analyze_market_workflow = tool({
  name: "analyze_market_workflow",
  description:
    "Run a shell-backed market trajectory analysis workflow and return growth, rent projection, occupancy, and fetch status.",
  parameters: MarketAnalysisWorkflowInputSchema.extend({
    orgId: orgIdSchema,
  }),
  execute: async ({ orgId, model, ...input }) => {
    const result = await runMarketAnalysisWorkflow({
      ...input,
      model,
    });
    const validated = MarketAnalysisWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});
