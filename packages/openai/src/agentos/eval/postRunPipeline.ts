import type { PrismaClient } from "@entitlement-os/db";

import { isAgentOsFeatureEnabled } from "../config.js";
import { SkillStore } from "../memory/procedural.js";
import { EpisodicMemoryStore } from "../memory/episodic.js";
import { TrajectoryLogger, type RunData, type TrajectoryRecord } from "./trajectoryLogger.js";
import { CostTracker } from "./costTracker.js";
import { ReflectionEngine, type ReflectionResult } from "./reflectionEngine.js";
import { CriticEvaluator, type CriticEvalResult } from "./criticEvaluator.js";
import { SkillDistiller } from "./skillDistiller.js";

async function propagateScores(
  trajectory: TrajectoryRecord,
  evalResult: CriticEvalResult,
  prisma: PrismaClient,
  qdrantUrl: string,
): Promise<void> {
  const normalizedScore = evalResult.overallScore / 10;

  if (isAgentOsFeatureEnabled("episodicMemory")) {
    const episodicStore = new EpisodicMemoryStore(prisma, qdrantUrl);
    const entries = await episodicStore.retrieve(
      trajectory.taskInput,
      trajectory.orgId,
      { agentId: trajectory.agentId },
      1,
    );

    if (entries.length > 0) {
      const entry = entries[0];
      const blendedConfidence = entry.confidence * 0.6 + normalizedScore * 0.4;
      await prisma.episodicEntry.update({
        where: { id: entry.id },
        data: { confidence: Math.min(1, blendedConfidence) },
      }).catch(() => {});
    }
  }

  if (isAgentOsFeatureEnabled("proceduralMemory")) {
    const skillStore = new SkillStore(prisma, qdrantUrl);
    const usedSkills = await skillStore.retrieve(
      trajectory.taskInput,
      trajectory.orgId,
      1,
    );

    for (const skill of usedSkills) {
      await skillStore.updateMetrics(
        skill.id,
        trajectory.finalOutput.length > 0,
        normalizedScore,
      ).catch(() => {});
    }
  }
}

export class PostRunPipeline {
  private trajectoryLogger: TrajectoryLogger;
  private costTracker: CostTracker;
  private reflectionEngine: ReflectionEngine;
  private criticEvaluator: CriticEvaluator;
  private skillDistiller: SkillDistiller;
  private prisma: PrismaClient;
  private qdrantUrl: string;

  constructor(prisma: PrismaClient, qdrantUrl: string) {
    this.prisma = prisma;
    this.qdrantUrl = qdrantUrl;
    this.trajectoryLogger = new TrajectoryLogger(prisma);
    this.costTracker = new CostTracker(prisma);
    this.reflectionEngine = new ReflectionEngine(prisma, qdrantUrl);
    this.criticEvaluator = new CriticEvaluator(prisma);
    this.skillDistiller = new SkillDistiller(prisma, qdrantUrl);
  }

  /**
   * Execute the full post-run pipeline. Fire-and-forget — caller should NOT await.
   * All errors are caught internally; this never throws.
   */
  async execute(runData: RunData): Promise<void> {
    try {
      await this._execute(runData);
    } catch (err) {
      console.error("[PostRunPipeline] Unhandled error:", err);
    }
  }

  private async _execute(runData: RunData): Promise<void> {
    const trajectory = await this.trajectoryLogger.capture(runData);
    if (!trajectory) return;

    let reflection: ReflectionResult | null = null;
    let evalResult: CriticEvalResult | null = null;

    try {
      reflection = await this.reflectionEngine.reflect(trajectory);
    } catch (err) {
      console.error("[PostRunPipeline] Reflection failed:", err);
    }

    try {
      evalResult = await this.criticEvaluator.evaluate(trajectory);
    } catch (err) {
      console.error("[PostRunPipeline] Critic evaluation failed:", err);
    }

    if (reflection) {
      try {
        await this.skillDistiller.tryDistill(trajectory, reflection, evalResult);
      } catch (err) {
        console.error("[PostRunPipeline] Skill distillation failed:", err);
      }
    }

    if (evalResult) {
      try {
        await propagateScores(trajectory, evalResult, this.prisma, this.qdrantUrl);
      } catch (err) {
        console.error("[PostRunPipeline] Score propagation failed:", err);
      }
    }
  }
}

/**
 * Convenience: fire-and-forget the post-run pipeline from the agent runtime.
 * Call this AFTER the SSE response is sent to the user.
 */
export function firePostRunPipeline(
  runData: RunData,
  prisma: PrismaClient,
  qdrantUrl: string,
): void {
  if (!isAgentOsFeatureEnabled("trajectoryCapture")) return;

  const pipeline = new PostRunPipeline(prisma, qdrantUrl);
  setImmediate(() => {
    void pipeline.execute(runData);
  });
}
