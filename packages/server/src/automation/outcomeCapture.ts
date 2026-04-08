import { logger } from "../logger";
import { captureOutcomeCalibrationForDealStatusChange } from "../services/outcome-capture.service";
import type { AutomationEvent } from "./types";

function resolveTerminalOutcomeStatus(
  event: AutomationEvent,
): "EXITED" | "KILLED" | null {
  if (event.type === "deal.statusChanged") {
    return event.to === "EXITED" || event.to === "KILLED" ? event.to : null;
  }

  if (event.type === "deal.stageChanged") {
    if (event.to === "CLOSED_WON") {
      return "EXITED";
    }
    if (event.to === "CLOSED_LOST") {
      return "KILLED";
    }
  }

  return null;
}

export async function handleOutcomeCapture(event: AutomationEvent): Promise<void> {
  if (event.type !== "deal.statusChanged" && event.type !== "deal.stageChanged") {
    return;
  }

  const terminalStatus = resolveTerminalOutcomeStatus(event);
  if (!terminalStatus) return;

  try {
    await captureOutcomeCalibrationForDealStatusChange({
      orgId: event.orgId,
      dealId: event.dealId,
      toStatus: terminalStatus,
    });
  } catch (error) {
    logger.error("Automation outcome capture failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
