import type { AutomationEvent } from "./types";
import { runEntitlementStrategyAutopilot } from "@/lib/services/entitlementStrategyAutopilot.service";
import { getAutomationDealContext, isEntitlementStrategy } from "./context";
import { captureAutomationTimeout } from "./sentry";
import { withTimeout } from "./timeout";
import { logger } from "@/lib/logger";

const ENTITLEMENT_STRATEGY_TIMEOUT_MS = 25_000;

/**
 * Entitlement strategy autopilot.
 *
 * Triggered by entitlement workflow transitions into Underwriting.
 * If KPI guardrails and recommendation confidence are healthy, it creates
 * actionable strategy tasks for the deal team.
 */
export async function handleEntitlementStrategyAutopilot(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "deal.statusChanged" && event.type !== "deal.stageChanged") {
    return;
  }

  try {
    if (
      event.type === "deal.statusChanged" &&
      event.to !== "PREAPP" &&
      event.to !== "CONCEPT"
    ) {
      return;
    }

    const context = await getAutomationDealContext(event.dealId, event.orgId);
    if (!isEntitlementStrategy(context)) {
      return;
    }
    if (!context || context.currentStageKey !== "UNDERWRITING") {
      return;
    }
    if (event.type === "deal.stageChanged" && event.to !== "UNDERWRITING") {
      return;
    }

    const result = await withTimeout(
      runEntitlementStrategyAutopilot({
        orgId: event.orgId,
        dealId: event.dealId,
        materializeTasks: true,
      }),
      ENTITLEMENT_STRATEGY_TIMEOUT_MS,
      "entitlementStrategy.runEntitlementStrategyAutopilot",
    );
    if (result === null) {
      captureAutomationTimeout({
        label: `runEntitlementStrategyAutopilot timed out after ${ENTITLEMENT_STRATEGY_TIMEOUT_MS}ms`,
        handler: "entitlementStrategy",
        eventType: event.type,
        dealId: event.dealId,
        orgId: event.orgId,
        status: "to" in event ? event.to : undefined,
      });
      return;
    }
  } catch (error) {
    logger.error("Automation entitlement strategy autopilot failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
