import type { DealStatus } from "@entitlement-os/shared";

// Event type definitions
export type AutomationEvent =
  | { type: "parcel.created"; dealId: string; parcelId: string; orgId: string }
  | { type: "parcel.enriched"; dealId: string; parcelId: string; orgId: string }
  | { type: "triage.completed"; dealId: string; runId: string; decision: string; orgId: string }
  | { type: "task.created"; dealId: string; taskId: string; orgId: string }
  | { type: "task.completed"; dealId: string; taskId: string; orgId: string }
  | { type: "deal.statusChanged"; dealId: string; from: DealStatus; to: DealStatus; orgId: string }
  | { type: "upload.created"; dealId: string; uploadId: string; orgId: string }
  | { type: "intake.received"; source: string; content: string; orgId: string };

export type AutomationEventType = AutomationEvent["type"];
export type AutomationHandler = (event: AutomationEvent) => Promise<void>;

// Handler registry
const handlers: Map<string, AutomationHandler[]> = new Map();

export function registerHandler(eventType: AutomationEventType, handler: AutomationHandler): void {
  const existing = handlers.get(eventType) || [];
  existing.push(handler);
  handlers.set(eventType, existing);
}

/**
 * Fire-and-forget event dispatch.
 * Handler errors are logged but NEVER propagated to caller.
 * Unregistered events are silent no-ops.
 */
export async function dispatchEvent(event: AutomationEvent): Promise<void> {
  const eventHandlers = handlers.get(event.type);
  if (!eventHandlers || eventHandlers.length === 0) return;

  for (const handler of eventHandlers) {
    try {
      await handler(event);
    } catch (err) {
      console.error(
        `[automation] Handler error for ${event.type}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

// Reset handlers (for testing only)
export function _resetHandlers(): void {
  handlers.clear();
}
