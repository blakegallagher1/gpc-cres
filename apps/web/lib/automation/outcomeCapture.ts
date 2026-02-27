import type { AutomationEvent } from "./events";

export async function handleOutcomeCapture(event: AutomationEvent): Promise<void> {
  if (event.type !== "deal.statusChanged") return;
  if (event.to !== "EXITED" && event.to !== "KILLED") return;

  try {
    const svc = await import("@/lib/services/outcomeCapture.service");
    await svc.captureOutcomeCalibrationForDealStatusChange({
      orgId: event.orgId,
      dealId: event.dealId,
      toStatus: event.to,
    });
  } catch (err) {
    console.error(
      "[automation] outcome capture failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

