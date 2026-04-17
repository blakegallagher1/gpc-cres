import * as Sentry from "@sentry/nextjs";
import { logger } from "../logger";
import {
  getRegisteredHandlers,
  resetAutomationHandlerRegistry,
  type AutomationEvent,
} from "./types";

export { registerHandler } from "./types";
export type { AutomationEvent, AutomationEventType, AutomationHandler } from "./types";

export type AutomationErrorCode =
  | "TRANSIENT_UPSTREAM"
  | "TRANSIENT_DB"
  | "PERMANENT_VALIDATION"
  | "PERMANENT_CONFIG"
  | "PERMANENT_NOT_FOUND"
  | "UNKNOWN";

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
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timeout") || message.includes("timed out") || message.includes("abort")) {
    return "TRANSIENT_UPSTREAM";
  }
  if (
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed")
  ) {
    return "TRANSIENT_UPSTREAM";
  }
  if (message.includes("502") || message.includes("503") || message.includes("504")) {
    return "TRANSIENT_UPSTREAM";
  }
  if (message.includes("prisma") || message.includes("connection") || message.includes("pool")) {
    return "TRANSIENT_DB";
  }
  if (message.includes("not found") || message.includes("no rows")) return "PERMANENT_NOT_FOUND";
  if (message.includes("invalid") || message.includes("required") || message.includes("validation")) {
    return "PERMANENT_VALIDATION";
  }
  if (
    message.includes("unconfigured") ||
    message.includes("missing env") ||
    message.includes("gateway_unconfigured")
  ) {
    return "PERMANENT_CONFIG";
  }
  return "UNKNOWN";
}

const HANDLER_TIMEOUT_MS = 30_000;
const STAGE_CHANGED_HANDLER_STAGGER_MS = 150;
const IDEMPOTENCY_WINDOW_MS = 10_000;
const recentIdempotencyKeys = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeIdempotencyKey(event: AutomationEvent): string {
  if (event.type === "agent.run.completed") {
    return `agent.run.completed:${event.orgId}:${event.runId}`;
  }

  const parts: string[] = [event.type, event.orgId];
  if ("dealId" in event && event.dealId) parts.push(event.dealId);
  if ("parcelId" in event) parts.push(event.parcelId);
  if ("taskId" in event) parts.push(event.taskId);
  if ("uploadId" in event) parts.push(event.uploadId);
  if ("runId" in event) parts.push(event.runId);
  if ("to" in event) parts.push(event.to);
  return parts.join(":");
}

function isDuplicateEvent(key: string): boolean {
  const now = Date.now();
  if (recentIdempotencyKeys.size > 500) {
    for (const [existingKey, timestamp] of recentIdempotencyKeys) {
      if (now - timestamp > IDEMPOTENCY_WINDOW_MS) {
        recentIdempotencyKeys.delete(existingKey);
      }
    }
  }

  const previousTimestamp = recentIdempotencyKeys.get(key);
  if (previousTimestamp != null && now - previousTimestamp < IDEMPOTENCY_WINDOW_MS) {
    return true;
  }

  recentIdempotencyKeys.set(key, now);
  return false;
}

export async function dispatchEvent(event: AutomationEvent): Promise<void> {
  const idempotencyKey = computeIdempotencyKey(event);
  if (isDuplicateEvent(idempotencyKey)) {
    return;
  }

  try {
    const { ensureHandlersRegistered } = await import("@gpc/server/automation/handlers");
    ensureHandlersRegistered();
  } catch (error) {
    logger.error("Automation handler registration failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        automation: true,
        phase: "handler_registration",
      },
    });
  }

  const eventHandlers = getRegisteredHandlers(event.type);
  const dealId = "dealId" in event ? event.dealId : undefined;
  const orgId = event.orgId;
  const status = "to" in event ? event.to : undefined;
  const timeBucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);

  for (const [index, handler] of eventHandlers.entries()) {
    const handlerName = handler.name || "anonymous";
    let eventId: string | undefined;
    const durableKey = `${idempotencyKey}:${handlerName}:${timeBucket}`;

    try {
      try {
        const { startEvent } = await import("@gpc/server/automation/automation-event.service");
        const result = await startEvent(
          orgId,
          handlerName,
          event.type,
          dealId,
          event as unknown as Record<string, unknown>,
          durableKey,
        );
        if (result === null) {
          continue;
        }
        eventId = result;
      } catch {
        // Database instrumentation is best-effort.
      }

      await Promise.race([
        handler(event),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new AutomationError(
                `Handler '${handlerName}' timed out after ${HANDLER_TIMEOUT_MS}ms`,
                "TRANSIENT_UPSTREAM",
              ),
            );
          }, HANDLER_TIMEOUT_MS);
        }),
      ]);

      if (eventId) {
        try {
          const { completeEvent } = await import("@gpc/server/automation/automation-event.service");
          await completeEvent(eventId);
        } catch {
          // Database instrumentation is best-effort.
        }
      }
    } catch (error) {
      const errorCode = classifyError(error);

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
        Sentry.captureException(error, {
          tags: {
            automation: true,
            handler: handlerName,
            error_code: errorCode,
          },
        });
      });

      logger.error("Automation handler execution failed", {
        errorCode,
        eventType: event.type,
        handlerName,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      if (eventId) {
        try {
          const { failEvent } = await import("@gpc/server/automation/automation-event.service");
          await failEvent(eventId, error, errorCode);
        } catch {
          // Database instrumentation is best-effort.
        }
      }
    }

    if (event.type === "deal.stageChanged" && index < eventHandlers.length - 1) {
      await sleep(STAGE_CHANGED_HANDLER_STAGGER_MS);
    }
  }

  const proactivePayload = event as unknown as Record<string, unknown>;
  void import("@gpc/server/automation/proactive-trigger.service")
    .then(({ evaluateProactiveEvent }) =>
      evaluateProactiveEvent({
        orgId: event.orgId,
        eventType: event.type,
        payload: proactivePayload,
      }),
    )
    .catch((error) => {
      logger.error("Automation proactive trigger evaluation failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
}

export function _resetHandlers(): void {
  resetAutomationHandlerRegistry();
  recentIdempotencyKeys.clear();
}

export { computeIdempotencyKey as _computeIdempotencyKey };
export { HANDLER_TIMEOUT_MS as _HANDLER_TIMEOUT_MS };
export { IDEMPOTENCY_WINDOW_MS as _IDEMPOTENCY_WINDOW_MS };
