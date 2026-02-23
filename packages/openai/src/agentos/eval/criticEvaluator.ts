import { z } from "zod";
import type { PrismaClient, Prisma } from "@entitlement-os/db";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";

import { createStrictJsonResponse } from "../../responses.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import type { TrajectoryRecord } from "./trajectoryLogger.js";

const DimensionScoreSchema = z.object({
  score: z.number().min(0).max(10),
  rationale: z.string(),
});

const CriticOutputSchema = z.object({
  planCorrectness: DimensionScoreSchema,
  toolEfficiency: DimensionScoreSchema,
  memoryRelevance: DimensionScoreSchema,
  costEfficiency: DimensionScoreSchema,
  riskHandling: DimensionScoreSchema,
  outputQuality: DimensionScoreSchema,
  overallRationale: z.string(),
});

type CriticOutput = z.infer<typeof CriticOutputSchema>;

export type CriticEvalResult = {
  id: string;
  trajectoryLogId: string;
  dimensionScores: Record<string, number>;
  overallScore: number;
  rationale: string;
};

const WEIGHTS: Record<string, number> = {
  planCorrectness: 0.20,
  toolEfficiency: 0.15,
  memoryRelevance: 0.15,
  costEfficiency: 0.10,
  riskHandling: 0.15,
  outputQuality: 0.25,
};

function computeOverallScore(output: CriticOutput): number {
  const dims: Record<string, number> = {
    planCorrectness: output.planCorrectness.score,
    toolEfficiency: output.toolEfficiency.score,
    memoryRelevance: output.memoryRelevance.score,
    costEfficiency: output.costEfficiency.score,
    riskHandling: output.riskHandling.score,
    outputQuality: output.outputQuality.score,
  };

  let weighted = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    weighted += (dims[key] ?? 0) * weight;
  }

  return Number(weighted.toFixed(2));
}

export class CriticEvaluator {
  constructor(private readonly prisma: PrismaClient) {}

  async evaluate(trajectory: TrajectoryRecord): Promise<CriticEvalResult | null> {
    if (!isAgentOsFeatureEnabled("criticEvaluation")) return null;

    const config = getAgentOsConfig();

    const toolSummary = trajectory.toolCalls
      .map((t) => `${t.toolName}: ${t.success ? "OK" : "FAIL"} (${t.latencyMs}ms, retries=${t.retryCount})`)
      .join("\n");

    const riskSummary = trajectory.riskEvents.length > 0
      ? trajectory.riskEvents.map((r) => `${r.type}: ${r.detail}`).join("\n")
      : "None";

    const response = await createStrictJsonResponse<CriticOutput>({
      model: config.models.critic,
      input: [
        {
          role: "system",
          content:
            "You are a critic evaluator for production AI agent workflows. " +
            "Score the trajectory on 6 dimensions (0-10 each) with brief rationale. " +
            "Be rigorous — a score of 7 means good, 8+ means excellent, <5 means significant issues.",
        },
        {
          role: "user",
          content: JSON.stringify({
            taskInput: trajectory.taskInput.slice(0, 2000),
            tools: toolSummary,
            finalOutputPreview: trajectory.finalOutput.slice(0, 1500),
            riskEvents: riskSummary,
            latencyMs: trajectory.latencyMs,
            costUsd: trajectory.costUsd,
            tokenUsage: trajectory.tokenUsage,
            plan: trajectory.plan?.slice(0, 500) ?? "No explicit plan",
          }),
        },
      ],
      jsonSchema: zodToOpenAiJsonSchema("critic_evaluation", CriticOutputSchema),
      reasoning: {
        effort: config.models.reasoningEffortCritic,
      },
    });

    const criticOutput = CriticOutputSchema.parse(response.outputJson);
    const overallScore = computeOverallScore(criticOutput);

    const dimensionScores: Record<string, number> = {
      planCorrectness: criticOutput.planCorrectness.score,
      toolEfficiency: criticOutput.toolEfficiency.score,
      memoryRelevance: criticOutput.memoryRelevance.score,
      costEfficiency: criticOutput.costEfficiency.score,
      riskHandling: criticOutput.riskHandling.score,
      outputQuality: criticOutput.outputQuality.score,
    };

    const row = await this.prisma.evalResult.create({
      data: {
        orgId: trajectory.orgId,
        trajectoryLogId: trajectory.id,
        dimensionScores: dimensionScores as Prisma.InputJsonValue,
        overallScore,
        rationale: criticOutput.overallRationale,
      },
    });

    await this.prisma.trajectoryLog.update({
      where: { id: trajectory.id },
      data: { evaluatorScore: overallScore / 10 },
    }).catch(() => {});

    return {
      id: row.id,
      trajectoryLogId: trajectory.id,
      dimensionScores,
      overallScore,
      rationale: criticOutput.overallRationale,
    };
  }
}
