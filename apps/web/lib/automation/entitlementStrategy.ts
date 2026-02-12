import type { AutomationEvent } from "./events";
import { runEntitlementStrategyAutopilot } from "@/lib/services/entitlementStrategyAutopilot.service";

/**
 * Entitlement strategy autopilot.
 *
 * Triggered by deal status transitions into PREAPP / CONCEPT.
 * If KPI guardrails and recommendation confidence are healthy, it creates
 * actionable strategy tasks for the deal team.
 */
export async function handleEntitlementStrategyAutopilot(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "deal.statusChanged") return;
  if (event.to !== "PREAPP" && event.to !== "CONCEPT") return;

  try {
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

