import { z } from "zod";

import { NETWORK_POLICIES } from "../network-policies.js";
import {
  buildPythonWorkflowCommand,
  runShellWorkflow,
} from "./runner.js";

const MARKET_INPUT_ARTIFACT_PATH = "/workspace/artifacts/market-analysis/input.json";
const MARKET_OUTPUT_ARTIFACT_PATH = "/workspace/artifacts/market-analysis/result.json";
const MARKET_SKILL_ARTIFACT_PATH = "/workspace/artifacts/market-analysis/skill.md";

const MarketAnalysisArtifactSchema = z.object({
  marketName: z.string().min(1),
  averageGrowthRate: z.number().finite(),
  projectedRentPerSqft: z.number().finite(),
  stabilizedOccupancy: z.number().finite(),
  dataFetchStatus: z.string().min(1),
});

export const MarketAnalysisWorkflowInputSchema = z.object({
  marketName: z.string().min(1),
  baseRentPerSqft: z.number().positive(),
  yearlyGrowthRates: z.array(z.number().finite().gt(-1)).min(1),
  vacancyRate: z.number().min(0).max(1).default(0.08),
  marketDataApiUrl: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const MarketAnalysisWorkflowResultSchema = MarketAnalysisArtifactSchema.extend({
  artifactPath: z.string().min(1),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export type MarketAnalysisWorkflowInput = z.infer<typeof MarketAnalysisWorkflowInputSchema>;
export type MarketAnalysisWorkflowResult = z.infer<typeof MarketAnalysisWorkflowResultSchema>;

export async function runMarketAnalysisWorkflow(
  rawInput: MarketAnalysisWorkflowInput,
): Promise<MarketAnalysisWorkflowResult> {
  return runShellWorkflow({
    rawInput,
    inputSchema: MarketAnalysisWorkflowInputSchema,
    artifactSchema: MarketAnalysisArtifactSchema,
    paths: {
      inputArtifactPath: MARKET_INPUT_ARTIFACT_PATH,
      outputArtifactPath: MARKET_OUTPUT_ARTIFACT_PATH,
      skillArtifactPath: MARKET_SKILL_ARTIFACT_PATH,
    },
    skillInstructionPath: "market-trajectory/SKILL.md",
    model: rawInput.model,
    policy: NETWORK_POLICIES.LOCAL_GATEWAY,
    buildCommand: (context) =>
      buildPythonWorkflowCommand(context, {
        imports: ["import os", "import urllib.error", "import urllib.request"],
        requiredSkill: "market-trajectory",
        scriptLines: [
          "api_url = payload.get('marketDataApiUrl') or 'https://api.gallagherpropco.com/health'",
          "headers = {}",
          "gateway_key = os.getenv('GATEWAY_KEY')",
          "if gateway_key:",
          "  headers['Authorization'] = f'Bearer {gateway_key}'",
          "request = urllib.request.Request(api_url, headers=headers)",
          "fetch_status = 'not_attempted'",
          "try:",
          "  with urllib.request.urlopen(request, timeout=5) as response:",
          "    fetch_status = f'ok:{response.status}'",
          "except urllib.error.URLError as err:",
          "  fetch_status = f'failed:{err.reason}'",
          "growth_rates = [float(value) for value in payload['yearlyGrowthRates']]",
          "average_growth = sum(growth_rates) / len(growth_rates)",
          "projected_rent = float(payload['baseRentPerSqft'])",
          "for rate in growth_rates:",
          "  projected_rent *= (1 + rate)",
          "stabilized_occupancy = 1 - float(payload['vacancyRate'])",
          "result = {",
          "  'marketName': payload['marketName'],",
          "  'averageGrowthRate': round(average_growth, 6),",
          "  'projectedRentPerSqft': round(projected_rent, 4),",
          "  'stabilizedOccupancy': round(stabilized_occupancy, 6),",
          "  'dataFetchStatus': fetch_status,",
          "}",
        ],
      }),
  }).then((result) => MarketAnalysisWorkflowResultSchema.parse(result));
}
