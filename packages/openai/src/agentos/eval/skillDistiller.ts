import { createHash } from "node:crypto";
import type { PrismaClient } from "@entitlement-os/db";

import { isAgentOsFeatureEnabled } from "../config.js";
import { SkillStore } from "../memory/procedural.js";
import type { TrajectoryRecord } from "./trajectoryLogger.js";
import type { ReflectionResult } from "./reflectionEngine.js";
import type { CriticEvalResult } from "./criticEvaluator.js";

function computeDedupeHash(name: string, procedure: string): string {
  const normalized = `${name.toLowerCase().trim()}::${procedure.toLowerCase().trim()}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function generateSkillMd(
  skill: { name: string; description: string; procedure: string },
  trajectory: TrajectoryRecord,
  evalScore: number,
): string {
  const toolList = [...new Set(trajectory.toolCalls.map((t) => t.toolName))];

  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `task_type: agent_run`,
    `success_rate: 1.0`,
    `evaluator_avg_score: ${(evalScore / 10).toFixed(2)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    "## When to use",
    skill.description,
    "",
    "## Procedure",
    skill.procedure,
    "",
    "## Expected tools",
    toolList.map((t) => `- ${t}`).join("\n"),
  ].join("\n");
}

export class SkillDistiller {
  private skillStore: SkillStore;

  constructor(prisma: PrismaClient, qdrantUrl: string) {
    this.skillStore = new SkillStore(prisma, qdrantUrl);
  }

  async tryDistill(
    trajectory: TrajectoryRecord,
    reflection: ReflectionResult,
    evalResult?: CriticEvalResult | null,
  ): Promise<string | null> {
    if (!isAgentOsFeatureEnabled("skillDistillation")) return null;
    if (!isAgentOsFeatureEnabled("proceduralMemory")) return null;

    if (trajectory.finalOutput.length === 0) return null;

    if (reflection.confidenceScore < 0.7) return null;

    if (evalResult && evalResult.overallScore < 7.0) return null;

    if (!reflection.suggestedSkill) return null;

    const skill = reflection.suggestedSkill;
    const dedupeHash = computeDedupeHash(skill.name, skill.procedure);

    const isDuplicate = await this.skillStore.checkDuplicate(
      dedupeHash,
      trajectory.orgId,
    );
    if (isDuplicate) return null;

    const evalScore = evalResult?.overallScore ?? 7.0;
    const skillMdContent = generateSkillMd(skill, trajectory, evalScore);
    const toolSequence = trajectory.toolCalls.map((t) => t.toolName);

    const skillId = await this.skillStore.store({
      name: skill.name,
      description: skill.description,
      skillMdContent,
      toolSequence,
      dedupeHash,
      orgId: trajectory.orgId,
    });

    return skillId;
  }
}
