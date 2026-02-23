import { z } from "zod";
import type { PrismaClient, Prisma } from "@entitlement-os/db";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";

import { createStrictJsonResponse } from "../../responses.js";
import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { EpisodicMemoryStore } from "../memory/episodic.js";
import { SemanticMemoryStore } from "../memory/semantic.js";
import type { TrajectoryRecord } from "./trajectoryLogger.js";

const KnowledgeUpdateSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

const SuggestedSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  procedure: z.string(),
});

const ReflectionResultSchema = z.object({
  whatWorked: z.array(z.string()),
  whatFailed: z.array(z.string()),
  reusableStrategy: z.string().nullable(),
  knowledgeUpdates: z.array(KnowledgeUpdateSchema),
  confidenceScore: z.number().min(0).max(1),
  suggestedSkill: SuggestedSkillSchema.nullable(),
});

export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

export class ReflectionEngine {
  private episodicStore: EpisodicMemoryStore | null;
  private semanticStore: SemanticMemoryStore | null;

  constructor(
    private readonly prisma: PrismaClient,
    qdrantUrl: string,
  ) {
    this.episodicStore = qdrantUrl
      ? new EpisodicMemoryStore(prisma, qdrantUrl)
      : null;
    this.semanticStore = new SemanticMemoryStore(prisma);
  }

  async reflect(trajectory: TrajectoryRecord): Promise<ReflectionResult | null> {
    if (!isAgentOsFeatureEnabled("reflection")) return null;

    const config = getAgentOsConfig();

    const toolSummary = trajectory.toolCalls
      .map((t) => `${t.toolName}: ${t.success ? "OK" : "FAIL"} (${t.latencyMs}ms)`)
      .join(", ");

    const riskSummary = trajectory.riskEvents.length > 0
      ? trajectory.riskEvents.map((r) => `${r.type}: ${r.detail}`).join("; ")
      : "None";

    const response = await createStrictJsonResponse<ReflectionResult>({
      model: config.models.agent,
      input: [
        {
          role: "system",
          content:
            "You are a post-run reflection engine for an AI agent system. " +
            "Analyze the completed trajectory and produce a structured reflection. " +
            "Focus on what worked, what failed, reusable strategies, and knowledge updates. " +
            "Be concise and actionable.",
        },
        {
          role: "user",
          content: JSON.stringify({
            taskInput: trajectory.taskInput.slice(0, 2000),
            toolsUsed: toolSummary,
            finalOutputPreview: trajectory.finalOutput.slice(0, 1000),
            riskEvents: riskSummary,
            latencyMs: trajectory.latencyMs,
            costUsd: trajectory.costUsd,
          }),
        },
      ],
      jsonSchema: zodToOpenAiJsonSchema("reflection_result", ReflectionResultSchema),
      reasoning: {
        effort: config.models.reasoningEffortReflection,
      },
    });

    const reflection = ReflectionResultSchema.parse(response.outputJson);

    await this.prisma.trajectoryLog.update({
      where: { id: trajectory.id },
      data: { reflection: reflection as unknown as Prisma.InputJsonValue },
    }).catch(() => {});

    if (isAgentOsFeatureEnabled("episodicMemory") && this.episodicStore) {
      const outcome = trajectory.finalOutput.length > 0 ? "SUCCESS" : "FAILURE";
      const summary = `Task: ${trajectory.taskInput.slice(0, 100)}. Outcome: ${outcome}. Strategy: ${reflection.reusableStrategy ?? "none"}`;

      await this.episodicStore.store({
        summary,
        outcome: outcome as "SUCCESS" | "FAILURE",
        confidence: reflection.confidenceScore,
        tags: ["reflection", trajectory.agentId],
        agentId: trajectory.agentId,
        taskType: "agent_run",
        orgId: trajectory.orgId,
      }).catch(() => {});
    }

    if (isAgentOsFeatureEnabled("semanticMemory") && this.semanticStore) {
      for (const update of reflection.knowledgeUpdates) {
        await this.semanticStore.upsert(
          update.key,
          { value: update.value } as Prisma.InputJsonValue,
          update.confidence,
          trajectory.id,
          trajectory.orgId,
        ).catch(() => {});
      }
    }

    return reflection;
  }
}
