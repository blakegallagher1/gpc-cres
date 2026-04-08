import "server-only";

import { AUTOMATION_CONFIG } from "../automation/config";

import { createEpisodicEntryFromTrajectoryLog } from "./episodic-memory.service";
import { promoteCandidateFactsFromRun } from "./learning-fact-promotion.service";
import { upsertProceduralSkillsFromEpisode } from "./procedural-skill.service";
import { createTrajectoryLogFromRun } from "./trajectory-log.service";

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
  signal?: AbortSignal;
};

export type PromoteRunToLongTermMemoryResult = {
  trajectoryLogId?: string;
  episodicEntryId?: string;
  promotedFactCount: number;
  updatedSkillCount: number;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Agent learning promotion aborted");
  }
}

export async function promoteRunToLongTermMemory(
  input: PromoteRunToLongTermMemoryInput,
): Promise<PromoteRunToLongTermMemoryResult> {
  let trajectoryLogId: string | undefined;
  let episodicEntryId: string | undefined;
  let promotedFactCount = 0;
  let updatedSkillCount = 0;

  if (AUTOMATION_CONFIG.agentLearning.createTrajectoryLogs) {
    throwIfAborted(input.signal);
    const trajectory = await createTrajectoryLogFromRun(input);
    trajectoryLogId = trajectory.trajectoryLogId;

    if (AUTOMATION_CONFIG.agentLearning.createEpisodes) {
      throwIfAborted(input.signal);
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
        signal: input.signal,
      });
      episodicEntryId = episode.episodicEntryId;

      if (AUTOMATION_CONFIG.agentLearning.promoteProcedures) {
        throwIfAborted(input.signal);
        const procedureResult = await upsertProceduralSkillsFromEpisode({
          orgId: input.orgId,
          episodicEntryId: episode.episodicEntryId,
          signal: input.signal,
        });
        updatedSkillCount = procedureResult.updatedSkillCount;
      }
    }
  }

  if (AUTOMATION_CONFIG.agentLearning.promoteFacts) {
    throwIfAborted(input.signal);
    const factResult = await promoteCandidateFactsFromRun({
      orgId: input.orgId,
      runId: input.runId,
      dealId: input.dealId ?? null,
      jurisdictionId: input.jurisdictionId ?? null,
      status: input.status,
      signal: input.signal,
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
