import { reinforceLearningFromDealOutcome } from "../services/outcome-reinforcement.service";
import type { AutomationEvent } from "./types";

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
