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
const nullableModelSchema = z.string().min(1).nullable();
const nullableUrlSchema = z.string().min(1).nullable();
const nullableVacancyRateSchema = z.number().min(0).max(1).nullable();
const DEFAULT_MARKET_VACANCY_RATE = 0.08;

const underwritingWorkflowToolParameters = z.object({
  ...UnderwritingWorkflowInputSchema.shape,
  model: nullableModelSchema,
  orgId: orgIdSchema,
});

const dataExtractionWorkflowToolParameters = z.object({
  ...DataExtractionWorkflowInputSchema.shape,
  sourceApiUrl: nullableUrlSchema,
  model: nullableModelSchema,
  orgId: orgIdSchema,
});

const marketAnalysisWorkflowToolParameters = z.object({
  ...MarketAnalysisWorkflowInputSchema.shape,
  vacancyRate: nullableVacancyRateSchema,
  marketDataApiUrl: nullableUrlSchema,
  model: nullableModelSchema,
  orgId: orgIdSchema,
});

export const run_underwriting_workflow = tool({
  name: "run_underwriting_workflow",
  description:
    "Run a deterministic, shell-backed underwriting calculation that returns DSCR and implied value from key financial inputs.",
  parameters: underwritingWorkflowToolParameters,
  execute: async ({ orgId, propertyName, netOperatingIncome, annualDebtService, capRate, model }) => {
    const result = await runUnderwritingWorkflow({
      propertyName,
      netOperatingIncome,
      annualDebtService,
      capRate,
      ...(model === null ? {} : { model }),
    });
    const validated = UnderwritingWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});

export const run_data_extraction_workflow = tool({
  name: "run_data_extraction_workflow",
  description:
    "Run a shell-backed text extraction workflow with regex rules and optional network validation checks.",
  parameters: dataExtractionWorkflowToolParameters,
  execute: async ({ orgId, sourceName, sourceApiUrl, rawText, rules, model }) => {
    const result = await runDataExtractionWorkflow({
      sourceName,
      rawText,
      rules,
      ...(sourceApiUrl === null ? {} : { sourceApiUrl }),
      ...(model === null ? {} : { model }),
    });
    const validated = DataExtractionWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});

export const analyze_market_workflow = tool({
  name: "analyze_market_workflow",
  description:
    "Run a shell-backed market trajectory analysis workflow and return growth, rent projection, occupancy, and fetch status.",
  parameters: marketAnalysisWorkflowToolParameters,
  execute: async ({
    orgId,
    marketName,
    baseRentPerSqft,
    yearlyGrowthRates,
    vacancyRate,
    marketDataApiUrl,
    model,
  }) => {
    const result = await runMarketAnalysisWorkflow({
      marketName,
      baseRentPerSqft,
      yearlyGrowthRates,
      vacancyRate: vacancyRate ?? DEFAULT_MARKET_VACANCY_RATE,
      ...(marketDataApiUrl === null ? {} : { marketDataApiUrl }),
      ...(model === null ? {} : { model }),
    });
    const validated = MarketAnalysisWorkflowResultSchema.parse(result);
    return runWorkflowResult.withMetadata(orgId, validated);
  },
});
