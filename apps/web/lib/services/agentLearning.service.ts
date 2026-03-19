import "server-only";

import { AUTOMATION_CONFIG } from "@/lib/automation/config";

import { createEpisodicEntryFromTrajectoryLog } from "./episodicMemory.service";
import { promoteCandidateFactsFromRun } from "./learningFactPromotion.service";
import { upsertProceduralSkillsFromEpisode } from "./proceduralSkill.service";
import { createTrajectoryLogFromRun } from "./trajectoryLog.service";

export type PromoteRunToLongTermMemoryInput = {
  runId: string;
  orgId: string;
  userId: string;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runType?: string | null;
  status: "succeeded" | "failed" | "canceled";
  inputPreview?: string | null;
  queryIntent?: string | null;
};

export type PromoteRunToLongTermMemoryResult = {
  trajectoryLogId?: string;
  episodicEntryId?: string;
  promotedFactCount: number;
  updatedSkillCount: number;
};

export async function promoteRunToLongTermMemory(
  input: PromoteRunToLongTermMemoryInput,
): Promise<PromoteRunToLongTermMemoryResult> {
  let trajectoryLogId: string | undefined;
  let episodicEntryId: string | undefined;
  let promotedFactCount = 0;
  let updatedSkillCount = 0;

  if (AUTOMATION_CONFIG.agentLearning.createTrajectoryLogs) {
    const trajectory = await createTrajectoryLogFromRun(input);
    trajectoryLogId = trajectory.trajectoryLogId;

    if (AUTOMATION_CONFIG.agentLearning.createEpisodes) {
      const episode = await createEpisodicEntryFromTrajectoryLog({
        orgId: input.orgId,
        userId: input.userId,
        runId: input.runId,
        dealId: input.dealId ?? null,
        jurisdictionId: input.jurisdictionId ?? null,
        conversationId: input.conversationId ?? null,
        runType: input.runType ?? null,
        queryIntent: input.queryIntent ?? null,
        trajectoryLogId: trajectory.trajectoryLogId,
        agentId: trajectory.agentId,
        taskInput: trajectory.taskInput,
        status: input.status,
      });
      episodicEntryId = episode.episodicEntryId;

      if (AUTOMATION_CONFIG.agentLearning.promoteProcedures) {
        const procedureResult = await upsertProceduralSkillsFromEpisode({
          orgId: input.orgId,
          episodicEntryId: episode.episodicEntryId,
        });
        updatedSkillCount = procedureResult.updatedSkillCount;
      }
    }
  }

  if (AUTOMATION_CONFIG.agentLearning.promoteFacts) {
    const factResult = await promoteCandidateFactsFromRun({
      orgId: input.orgId,
      runId: input.runId,
      dealId: input.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? null,
      status: input.status,
    });
    promotedFactCount = factResult.verified + factResult.drafted;
  }

  return {
    trajectoryLogId,
    episodicEntryId,
    promotedFactCount,
    updatedSkillCount,
  };
}
