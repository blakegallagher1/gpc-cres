import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type {
  AgentRunWorkflowInput,
  AgentRunWorkflowOutput,
} from "@entitlement-os/shared";

const { runAgentTurn } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

export async function agentRunWorkflow(
  params: AgentRunWorkflowInput,
): Promise<AgentRunWorkflowOutput> {
  return runAgentTurn(params);
}
