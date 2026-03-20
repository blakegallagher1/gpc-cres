import { prisma } from "@entitlement-os/db";

import { promoteRunToLongTermMemory } from "@/lib/services/agentLearning.service";

import { AUTOMATION_CONFIG } from "./config";
import type { AutomationEvent } from "./events";
import { captureAutomationTimeout } from "./sentry";
import { withTimeout } from "./timeout";

type AgentRunCompletedEvent = Extract<AutomationEvent, { type: "agent.run.completed" }>;

const LEARNING_PROMOTION_TIMEOUT_MS = 20_000;

function asCancelablePromise<T>(
  promise: Promise<T>,
  cancel: () => void,
): Promise<T> & { cancel: () => void } {
  const cancelable = promise as Promise<T> & { cancel: () => void };
  cancelable.cancel = cancel;
  return cancelable;
}

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
    const timeoutController = new AbortController();
    const result = await withTimeout(
      asCancelablePromise(
        promoteRunToLongTermMemory({
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
          signal: timeoutController.signal,
        }),
        () => timeoutController.abort(),
      ),
      LEARNING_PROMOTION_TIMEOUT_MS,
      "agentLearningPromotion.promoteRunToLongTermMemory",
    );
    if (result === null) {
      captureAutomationTimeout({
        label: `promoteRunToLongTermMemory timed out after ${LEARNING_PROMOTION_TIMEOUT_MS}ms`,
        handler: "agentLearningPromotion",
        eventType: event.type,
        dealId: event.dealId ?? undefined,
        orgId: event.orgId,
        status: event.status,
      });
      try {
        await prisma.run.update({
          where: { id: event.runId },
          data: {
            memoryPromotionStatus: "skipped_timeout",
            memoryPromotionError: `Timed out after ${LEARNING_PROMOTION_TIMEOUT_MS}ms`,
          },
        });
      } catch (error) {
        console.error(
          "[automation] Failed to record agent learning timeout:",
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }

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
