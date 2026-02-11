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
 * Automatically instruments all handler executions to automation_events table.
 */
export async function dispatchEvent(event: AutomationEvent): Promise<void> {
  const eventHandlers = handlers.get(event.type);
  if (!eventHandlers || eventHandlers.length === 0) return;

  // Extract dealId from event (not all events have it)
  const dealId = "dealId" in event ? event.dealId : undefined;

  for (const handler of eventHandlers) {
    const handlerName = handler.name || "anonymous";
    let eventId: string | undefined;

    try {
      // Record event start (lazy import to avoid circular deps in tests)
      try {
        const svc = await import("@/lib/services/automationEvent.service");
        eventId = await svc.startEvent(
          handlerName,
          event.type,
          dealId,
          event as unknown as Record<string, unknown>
        );
      } catch {
        // DB not available (e.g. in tests) — continue without instrumentation
      }

      await handler(event);

      // Record success
      if (eventId) {
        try {
          const svc = await import("@/lib/services/automationEvent.service");
          await svc.completeEvent(eventId);
        } catch {
          // Silent
        }
      }
    } catch (err) {
      console.error(
        `[automation] Handler error for ${event.type}:`,
        err instanceof Error ? err.message : String(err)
      );

      // Record failure
      if (eventId) {
        try {
          const svc = await import("@/lib/services/automationEvent.service");
          await svc.failEvent(eventId, err);
        } catch {
          // Silent
        }
      }
    }
  }
}

// Reset handlers (for testing only)
export function _resetHandlers(): void {
  handlers.clear();
}
