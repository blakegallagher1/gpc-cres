import type { AutomationEvent } from "./events";
import { runEntitlementStrategyAutopilot } from "@/lib/services/entitlementStrategyAutopilot.service";
import { getAutomationDealContext, isEntitlementStrategy } from "./context";

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

    await runEntitlementStrategyAutopilot({
      orgId: event.orgId,
      dealId: event.dealId,
      materializeTasks: true,
    });
  } catch (error) {
    console.error(
      "[automation] Entitlement strategy autopilot failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
