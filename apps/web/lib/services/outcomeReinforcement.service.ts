import "server-only";

import { prisma } from "@entitlement-os/db";

export type ReinforceLearningFromDealOutcomeInput = {
  orgId: string;
  dealId: string;
  terminalStatus: "EXITED" | "KILLED";
};

export type ReinforceLearningFromDealOutcomeResult = {
  updatedEpisodeCount: number;
  updatedSkillCount: number;
};

export async function reinforceLearningFromDealOutcome(
  input: ReinforceLearningFromDealOutcomeInput,
): Promise<ReinforceLearningFromDealOutcomeResult> {
  const episodes = await prisma.episodicEntry.findMany({
    where: {
      orgId: input.orgId,
      dealId: input.dealId,
      outcomeLinkedAt: null,
    },
    select: {
      id: true,
      proceduralSkillEpisodes: {
        select: {
          proceduralSkillId: true,
        },
      },
    },
  });

  if (episodes.length === 0) {
    return {
      updatedEpisodeCount: 0,
      updatedSkillCount: 0,
    };
  }

  const now = new Date();
  const episodeIds = episodes.map((episode) => episode.id);

  await prisma.episodicEntry.updateMany({
    where: {
      id: {
        in: episodeIds,
      },
    },
    data: {
      outcomeLinkedAt: now,
    },
  });

  const skillUpdateCounts = new Map<string, number>();
  for (const episode of episodes) {
    for (const link of episode.proceduralSkillEpisodes) {
      skillUpdateCounts.set(
        link.proceduralSkillId,
        (skillUpdateCounts.get(link.proceduralSkillId) ?? 0) + 1,
      );
    }
  }

  for (const [skillId, count] of skillUpdateCounts) {
    const skill = await prisma.proceduralSkill.findUnique({
      where: { id: skillId },
      select: {
        successCount: true,
        failCount: true,
      },
    });

    if (!skill) continue;

    const successCount =
      skill.successCount + (input.terminalStatus === "EXITED" ? count : 0);
    const failCount =
      skill.failCount + (input.terminalStatus === "KILLED" ? count : 0);

    await prisma.proceduralSkill.update({
      where: { id: skillId },
      data: {
        successCount,
        failCount,
        successRate: successCount / Math.max(1, successCount + failCount),
      },
    });
  }

  return {
    updatedEpisodeCount: episodeIds.length,
    updatedSkillCount: skillUpdateCounts.size,
  };
}
