import {
  isDatabaseConnectivityError,
  runAgentWorkflow as runAgentWorkflowCore,
  type AgentRunInput,
} from "@gpc/server/chat/run-agent-workflow.service";
import { executeAgentWorkflow } from "./executeAgent";

export { isDatabaseConnectivityError };
export type { AgentRunInput } from "@gpc/server/chat/run-agent-workflow.service";

export async function runAgentWorkflow(
  params: Omit<AgentRunInput, "executeAgentWorkflow">,
) {
  return runAgentWorkflowCore({
    ...params,
    executeAgentWorkflow,
  });
}
