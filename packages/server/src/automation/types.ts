import type { DealStageKey, DealStatus } from "@entitlement-os/shared";

/**
 * All supported automation event payloads.
 */
export type AutomationEvent =
  | { type: "parcel.created"; dealId: string; parcelId: string; orgId: string }
  | { type: "parcel.enriched"; dealId: string; parcelId: string; orgId: string }
  | { type: "triage.completed"; dealId: string; runId: string; decision: string; orgId: string }
  | { type: "task.created"; dealId: string; taskId: string; orgId: string }
  | { type: "task.completed"; dealId: string; taskId: string; orgId: string }
  | { type: "deal.statusChanged"; dealId: string; from: DealStatus; to: DealStatus; orgId: string }
  | { type: "deal.stageChanged"; dealId: string; from: DealStageKey | null; to: DealStageKey; orgId: string }
  | { type: "upload.created"; dealId: string; uploadId: string; orgId: string }
  | { type: "intake.received"; source: string; content: string; orgId: string }
  | {
      type: "agent.run.completed";
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
    }
  | {
      type: "chat.analysis.completed";
      runId: string;
      orgId: string;
      userId: string;
      conversationId: string | null;
      dealId: string | null;
      finalTextPreview: string;
      toolsInvoked: string[];
      confidence: number;
      intent: string | null;
    };

/**
 * Valid automation event discriminator values.
 */
export type AutomationEventType = AutomationEvent["type"];

/**
 * Async handler signature for automation event dispatch.
 */
export type AutomationHandler<TEvent extends AutomationEvent = AutomationEvent> = (
  event: TEvent,
) => Promise<void>;

type RegisteredAutomationHandler = AutomationHandler<AutomationEvent>;

const handlers: Map<AutomationEventType, RegisteredAutomationHandler[]> = new Map();

/**
 * Registers a handler for a specific automation event type.
 */
export function registerHandler<TEventType extends AutomationEventType>(
  eventType: TEventType,
  handler: AutomationHandler<Extract<AutomationEvent, { type: TEventType }>>,
): void {
  const existing = handlers.get(eventType) ?? [];
  existing.push(handler as RegisteredAutomationHandler);
  handlers.set(eventType, existing);
}

/**
 * Returns all handlers currently registered for an automation event type.
 */
export function getRegisteredHandlers(
  eventType: AutomationEventType,
): RegisteredAutomationHandler[] {
  return handlers.get(eventType) ?? [];
}

/**
 * Clears the in-memory automation handler registry.
 */
export function resetAutomationHandlerRegistry(): void {
  handlers.clear();
}
