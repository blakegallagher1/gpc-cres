import { prisma } from "@entitlement-os/db";

import { promoteRunToLongTermMemory } from "@/lib/services/agentLearning.service";

import { AUTOMATION_CONFIG } from "./config";
import type { AutomationEvent } from "./events";

type AgentRunCompletedEvent = Extract<AutomationEvent, { type: "agent.run.completed" }>;

/**
 * Promote a completed run into long-term learning artifacts.
 * This is best-effort asynchronous work and must never run inline with chat completion.
 */
export async function handleAgentLearningPromotion(
  event: AgentRunCompletedEvent,
): Promise<void> {
  if (event.type !== "agent.run.completed") return;
  if (!AUTOMATION_CONFIG.agentLearning.enabled) return;

  await prisma.run.update({
    where: { id: event.runId },
    data: {
      memoryPromotionStatus: "processing",
      memoryPromotionError: null,
    },
  });

  try {
    await promoteRunToLongTermMemory({
      runId: event.runId,
      orgId: event.orgId,
      userId: event.userId,
      conversationId: event.conversationId ?? null,
      dealId: event.dealId ?? null,
      jurisdictionId: event.jurisdictionId ?? null,
      runType: event.runType ?? null,
      status: event.status,
      inputPreview: event.inputPreview ?? null,
      queryIntent: event.queryIntent ?? null,
    });

    await prisma.run.update({
      where: { id: event.runId },
      data: {
        memoryPromotionStatus: "succeeded",
        memoryPromotedAt: new Date(),
        memoryPromotionError: null,
      },
    });
  } catch (error) {
    await prisma.run.update({
      where: { id: event.runId },
      data: {
        memoryPromotionStatus: "failed",
        memoryPromotionError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
