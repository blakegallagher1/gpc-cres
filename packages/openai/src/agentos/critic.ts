import { z } from "zod";
import type { Prisma } from "@entitlement-os/db";
import { prisma } from "@entitlement-os/db";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";

import { createStrictJsonResponse } from "../responses.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "./config.js";

const CriticIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string(),
  detail: z.string(),
});

const CriticSuggestionSchema = z.object({
  action: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

const CriticEvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  summary: z.string(),
  issues: z.array(CriticIssueSchema),
  suggestions: z.array(CriticSuggestionSchema),
});

export type CriticEvaluation = z.infer<typeof CriticEvaluationSchema>;

export type RunCriticInput = {
  runId: string;
  orgId: string;
  finalOutput: string;
  toolsInvoked: string[];
  toolFailures?: string[];
  missingEvidence?: string[];
};

type JsonRecord = Record<string, unknown>;

function normalizeOutputJson(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

async function evaluateRunWithCritic(input: RunCriticInput): Promise<CriticEvaluation> {
  const config = getAgentOsConfig();
  const response = await createStrictJsonResponse<CriticEvaluation>({
    model: config.models.critic,
    input: [
      {
        role: "system",
        content:
          "You are a post-run evaluator for production AI agent workflows. " +
          "Evaluate only execution quality, evidence sufficiency, and failure risks. " +
          "Do not restate the full answer.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            runId: input.runId,
            orgId: input.orgId,
            finalOutput: input.finalOutput,
            toolsInvoked: input.toolsInvoked,
            toolFailures: input.toolFailures ?? [],
            missingEvidence: input.missingEvidence ?? [],
          },
          null,
          2,
        ),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema("run_critic_evaluation", CriticEvaluationSchema),
    reasoning: {
      effort: config.models.reasoningEffortCritic,
    },
    contextManagement: isAgentOsFeatureEnabled("contextManagementCompaction")
      ? { strategy: config.contextManagement.strategy }
      : null,
  });

  return CriticEvaluationSchema.parse(response.outputJson);
}

async function persistCriticEvaluation(runId: string, evaluation: CriticEvaluation): Promise<void> {
  const existing = await prisma.run.findUnique({
    where: { id: runId },
    select: { outputJson: true },
  });
  if (!existing) return;

  const outputJson = normalizeOutputJson(existing.outputJson);
  const nextOutputJson = {
    ...outputJson,
    criticEvaluation: {
      ...evaluation,
      evaluatedAt: new Date().toISOString(),
      schemaVersion: "1.0",
    },
  } as Prisma.InputJsonValue;

  await prisma.run.update({
    where: { id: runId },
    data: {
      outputJson: nextOutputJson,
    },
  });
}

export async function runCriticEvaluation(input: RunCriticInput): Promise<void> {
  if (!isAgentOsFeatureEnabled("criticEvaluation")) {
    return;
  }
  if (!input.finalOutput || input.finalOutput.trim().length === 0) {
    return;
  }
  const evaluation = await evaluateRunWithCritic(input);
  await persistCriticEvaluation(input.runId, evaluation);
}

