import * as Sentry from "@sentry/nextjs";
import type { DealStageKey, DealStatus } from "@entitlement-os/shared";

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type AutomationErrorCode =
  | "TRANSIENT_UPSTREAM"   // Gateway/API timeout or 5xx — safe to retry
  | "TRANSIENT_DB"         // DB connection or lock — safe to retry
  | "PERMANENT_VALIDATION" // Bad input or business rule — never retry
  | "PERMANENT_CONFIG"     // Missing config/env — never retry
  | "PERMANENT_NOT_FOUND"  // Entity deleted or missing — never retry
  | "UNKNOWN";             // Unclassified — log and alert

export class AutomationError extends Error {
  code: AutomationErrorCode;
  retryable: boolean;

  constructor(message: string, code: AutomationErrorCode) {
    super(message);
    this.name = "AutomationError";
    this.code = code;
    this.retryable = code.startsWith("TRANSIENT");
  }
}

export function classifyError(error: unknown): AutomationErrorCode {
  if (error instanceof AutomationError) return error.code;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("abort")) return "TRANSIENT_UPSTREAM";
  if (msg.includes("econnreset") || msg.includes("socket hang up") || msg.includes("fetch failed")) return "TRANSIENT_UPSTREAM";
  if (msg.includes("502") || msg.includes("503") || msg.includes("504")) return "TRANSIENT_UPSTREAM";
  if (msg.includes("prisma") || msg.includes("connection") || msg.includes("pool")) return "TRANSIENT_DB";
  if (msg.includes("not found") || msg.includes("no rows")) return "PERMANENT_NOT_FOUND";
  if (msg.includes("invalid") || msg.includes("required") || msg.includes("validation")) return "PERMANENT_VALIDATION";
  if (msg.includes("unconfigured") || msg.includes("missing env") || msg.includes("gateway_unconfigured")) return "PERMANENT_CONFIG";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Event type definitions
// ---------------------------------------------------------------------------

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
    };

export type AutomationEventType = AutomationEvent["type"];
export type AutomationHandler<TEvent extends AutomationEvent = AutomationEvent> = (
  event: TEvent,
) => Promise<void>;
type RegisteredAutomationHandler = AutomationHandler<AutomationEvent>;

// Handler registry
const handlers: Map<AutomationEventType, RegisteredAutomationHandler[]> = new Map();

/** Max time a single handler is allowed to run before being considered stuck. */
const HANDLER_TIMEOUT_MS = 30_000;
const STAGE_CHANGED_HANDLER_STAGGER_MS = 150;

/** Window for idempotency dedup — events with the same key within this window are skipped. */
const IDEMPOTENCY_WINDOW_MS = 10_000;

/**
 * In-memory set of recently dispatched idempotency keys.
 * Entries are auto-evicted after IDEMPOTENCY_WINDOW_MS.
 */
const recentIdempotencyKeys = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeIdempotencyKey(event: AutomationEvent): string {
  if (event.type === "agent.run.completed") {
    return `agent.run.completed:${event.orgId}:${event.runId}`;
  }

  const parts = [event.type, event.orgId];
  if ("dealId" in event) parts.push(event.dealId);
  if ("parcelId" in event) parts.push(event.parcelId);
  if ("taskId" in event) parts.push(event.taskId);
  if ("uploadId" in event) parts.push(event.uploadId);
  if ("runId" in event) parts.push(event.runId);
  if ("to" in event) parts.push(event.to);
  return parts.join(":");
}

function isDuplicateEvent(key: string): boolean {
  const now = Date.now();
  // Evict stale entries (amortized cleanup)
  if (recentIdempotencyKeys.size > 500) {
    for (const [k, ts] of recentIdempotencyKeys) {
      if (now - ts > IDEMPOTENCY_WINDOW_MS) recentIdempotencyKeys.delete(k);
    }
  }
  const prev = recentIdempotencyKeys.get(key);
  if (prev != null && now - prev < IDEMPOTENCY_WINDOW_MS) return true;
  recentIdempotencyKeys.set(key, now);
  return false;
}

export function registerHandler<TEventType extends AutomationEventType>(
  eventType: TEventType,
  handler: AutomationHandler<Extract<AutomationEvent, { type: TEventType }>>,
): void {
  const existing = handlers.get(eventType) || [];
  existing.push(handler as RegisteredAutomationHandler);
  handlers.set(eventType, existing);
}

/**
 * Fire-and-forget event dispatch.
 * Handler errors are logged but NEVER propagated to caller.
 * Unregistered events are silent no-ops.
 * Duplicate events (same idempotency key within 10s) are silently skipped.
 * Each handler has a 30s timeout to prevent stuck runs.
 * Automatically instruments all handler executions to automation_events table.
 */
export async function dispatchEvent(event: AutomationEvent): Promise<void> {
  const idempotencyKey = computeIdempotencyKey(event);
  if (isDuplicateEvent(idempotencyKey)) {
    return; // Silently skip duplicate
  }
  try {
    const { ensureHandlersRegistered } = await import("./handlers");
    ensureHandlersRegistered();
  } catch (error) {
    console.error(
      "[automation] handler registration failed:",
      error instanceof Error ? error.message : String(error),
    );
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        automation: true,
        phase: "handler_registration",
      },
    });
  }

  const eventHandlers = handlers.get(event.type) ?? [];

  // Extract dealId from event (not all events have it)
  const dealId = "dealId" in event ? event.dealId : undefined;
  const orgId = event.orgId;
  const status = "to" in event ? event.to : undefined;

  // Time bucket: floor to 10s boundary for idempotency key stability.
  const timeBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);

  for (const [index, handler] of eventHandlers.entries()) {
    const handlerName = handler.name || "anonymous";
    let eventId: string | undefined;
    const durableKey = `${idempotencyKey}:${handlerName}:${timeBucket}`;

    try {
      // Record event start with durable idempotency guard.
      // startEvent returns null if a row with the same key already exists
      // (cross-instance dedup via Postgres unique index).
      try {
        const svc = await import("@/lib/services/automationEvent.service");
        const result = await svc.startEvent(
          orgId,
          handlerName,
          event.type,
          dealId,
          event as unknown as Record<string, unknown>,
          durableKey,
        );
        if (result === null) {
          // Durable dedup: another instance already claimed this event+handler
          continue;
        }
        eventId = result;
      } catch {
        // DB not available (e.g. in tests) — continue without instrumentation
      }

      // Run handler with timeout
      await Promise.race([
        handler(event),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new AutomationError(
            `Handler '${handlerName}' timed out after ${HANDLER_TIMEOUT_MS}ms`,
            "TRANSIENT_UPSTREAM",
          )), HANDLER_TIMEOUT_MS),
        ),
      ]);

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
      const errorCode = classifyError(err);

      Sentry.withScope((scope) => {
        scope.setTag("automation", true);
        scope.setTag("handler", handlerName);
        scope.setTag("error_code", errorCode);
        if (orgId) scope.setTag("org_id", orgId);
        if (dealId) scope.setTag("deal_id", dealId);
        if (status) scope.setTag("status", status);
        scope.setContext("deal", {
          dealId,
          orgId,
          status,
        });
        scope.setContext("automation", {
          eventType: event.type,
          idempotencyKey,
          errorCode,
          retryable: errorCode.startsWith("TRANSIENT"),
        });
        Sentry.captureException(err, {
          tags: {
            automation: true,
            handler: handlerName,
            error_code: errorCode,
          },
        });
      });

      console.error(
        `[automation][${errorCode}] Handler error for ${event.type}/${handlerName}:`,
        err instanceof Error ? err.message : String(err)
      );

      // Record failure with error code
      if (eventId) {
        try {
          const svc = await import("@/lib/services/automationEvent.service");
          await svc.failEvent(eventId, err, errorCode);
        } catch {
          // Silent
        }
      }
    }

    if (
      event.type === "deal.stageChanged" &&
      index < eventHandlers.length - 1
    ) {
      await sleep(STAGE_CHANGED_HANDLER_STAGGER_MS);
    }
  }

  const proactivePayload = event as unknown as Record<string, unknown>;
  void import("@/lib/services/proactiveTrigger.service")
    .then(({ evaluateProactiveEvent }) =>
      evaluateProactiveEvent({
        orgId: event.orgId,
        eventType: event.type,
        payload: proactivePayload,
      }),
    )
    .catch((error) => {
      console.error(
        "[automation] proactive trigger evaluation failed:",
        error instanceof Error ? error.message : String(error),
      );
    });
}

// Reset handlers and idempotency state (for testing only)
export function _resetHandlers(): void {
  handlers.clear();
  recentIdempotencyKeys.clear();
}

// Exports for testing
export { computeIdempotencyKey as _computeIdempotencyKey };
export { HANDLER_TIMEOUT_MS as _HANDLER_TIMEOUT_MS };
export { IDEMPOTENCY_WINDOW_MS as _IDEMPOTENCY_WINDOW_MS };
