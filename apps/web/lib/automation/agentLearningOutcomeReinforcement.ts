import type { AutomationEvent } from "./types";

import { reinforceLearningFromDealOutcome } from "@/lib/services/outcomeReinforcement.service";

export async function handleAgentLearningOutcomeReinforcement(
  event: AutomationEvent,
): Promise<void> {
  if (event.type !== "deal.stageChanged") {
    return;
  }

  const terminalStatus =
    event.to === "CLOSED_WON"
      ? "EXITED"
      : event.to === "CLOSED_LOST"
        ? "KILLED"
        : null;

  if (!terminalStatus) {
    return;
  }

  await reinforceLearningFromDealOutcome({
    orgId: event.orgId,
    dealId: event.dealId,
    terminalStatus,
  });
}
