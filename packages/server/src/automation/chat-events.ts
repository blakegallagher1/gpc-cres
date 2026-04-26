import * as Sentry from "@sentry/nextjs";

import { logger } from "../logger";
import { handleAgentLearningPromotion } from "./agentLearningPromotion";
import { handleChatAnalysisAudit } from "./chat-bridge";
import type { AutomationEvent } from "./types";

type ChatAutomationEvent = Extract<
  AutomationEvent,
  { type: "agent.run.completed" | "chat.analysis.completed" }
>;

type ChatAutomationHandler<TEvent extends ChatAutomationEvent> = (
  event: TEvent,
) => Promise<void>;

const CHAT_HANDLER_TIMEOUT_MS = 30_000;
const CHAT_IDEMPOTENCY_WINDOW_MS = 10_000;
const recentChatIdempotencyKeys = new Map<string, number>();

function sleepWithTimeout(handlerName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Handler '${handlerName}' timed out after ${CHAT_HANDLER_TIMEOUT_MS}ms`));
    }, CHAT_HANDLER_TIMEOUT_MS);
  });
}

function computeChatIdempotencyKey(event: ChatAutomationEvent): string {
  if (event.type === "agent.run.completed") {
    return `agent.run.completed:${event.orgId}:${event.runId}`;
  }

  return `chat.analysis.completed:${event.orgId}:${event.runId}`;
}

function isDuplicateChatEvent(key: string): boolean {
  const now = Date.now();
  for (const [existingKey, timestamp] of recentChatIdempotencyKeys) {
    if (now - timestamp > CHAT_IDEMPOTENCY_WINDOW_MS) {
      recentChatIdempotencyKeys.delete(existingKey);
    }
  }

  const previousTimestamp = recentChatIdempotencyKeys.get(key);
  if (previousTimestamp != null && now - previousTimestamp < CHAT_IDEMPOTENCY_WINDOW_MS) {
    return true;
  }

  recentChatIdempotencyKeys.set(key, now);
  return false;
}

async function runChatAutomationHandler<TEvent extends ChatAutomationEvent>(
  event: TEvent,
  handlerName: string,
  handler: ChatAutomationHandler<TEvent>,
): Promise<void> {
  try {
    await Promise.race([handler(event), sleepWithTimeout(handlerName)]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV !== "production" && errorMessage.includes("fetch failed")) {
      logger.info("Chat automation handler skipped in local development", {
        eventType: event.type,
        handlerName,
        errorMessage,
      });
      return;
    }

    logger.warn("Chat automation handler skipped", {
      eventType: event.type,
      handlerName,
      errorMessage,
    });
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        automation: true,
        event_type: event.type,
        handler: handlerName,
      },
    });
  }
}

export async function dispatchChatAutomationEvent(
  event: ChatAutomationEvent,
): Promise<void> {
  if (isDuplicateChatEvent(computeChatIdempotencyKey(event))) {
    return;
  }

  if (event.type === "agent.run.completed") {
    await runChatAutomationHandler(
      event,
      "handleAgentLearningPromotion",
      handleAgentLearningPromotion,
    );
    return;
  }

  await runChatAutomationHandler(
    event,
    "handleChatAnalysisAudit",
    handleChatAnalysisAudit,
  );
}
