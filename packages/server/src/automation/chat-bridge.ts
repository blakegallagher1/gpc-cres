import { registerHandler, type AutomationEvent } from "./types";
import { startEvent, completeEvent, failEvent } from "./automation-event.service";
import { logger } from "../logger";

export async function handleChatAnalysisAudit(
  event: Extract<AutomationEvent, { type: "chat.analysis.completed" }>,
): Promise<void> {
  let eventId: string | null = null;
  try {
    eventId = await startEvent(
      event.orgId,
      "chat",
      "chat.analysis.completed",
      event.dealId,
      {
        runId: event.runId,
        conversationId: event.conversationId,
        toolsInvoked: event.toolsInvoked,
        confidence: event.confidence,
        intent: event.intent,
        finalTextPreview: event.finalTextPreview,
      },
      `chat-analysis:${event.runId}`,
    );
    if (eventId) {
      await completeEvent(eventId, {
        toolCount: event.toolsInvoked.length,
        confidence: event.confidence,
      });
    }
  } catch (error) {
    logger.warn("Chat analysis audit handler failed", {
      runId: event.runId,
      orgId: event.orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (eventId) {
      await failEvent(eventId, error, "UNKNOWN").catch(() => {});
    }
  }
}

/**
 * Records chat analysis completions as an automation_event row so operators have
 * an audit trail that unifies chat findings with background handler activity.
 *
 * Downstream handlers can register additional chat.analysis.completed listeners
 * (e.g. "if triage score > 75, order environ") and they compose naturally.
 */
export function registerChatAnalysisAuditHandler(): void {
  registerHandler("chat.analysis.completed", handleChatAnalysisAudit);
}
