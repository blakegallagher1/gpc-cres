import type { AgentInputMessage } from "@entitlement-os/shared";
import type { ExecuteAgentWorkflow } from "./agent-runtime-adapter";
import { runAgentWorkflow } from "./run-agent-workflow.service";

export interface RunAgentApiParams {
  orgId: string;
  userId: string;
  executeAgentWorkflow: ExecuteAgentWorkflow;
  conversationId?: string | null;
  message?: string;
  input?: AgentInputMessage[];
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  runType?: string;
  maxTurns?: number;
  correlationId: string;
  persistConversation?: boolean;
  injectSystemContext?: boolean;
  onEvent?: (event: Record<string, unknown>) => void;
}

export async function runAgentApi(params: RunAgentApiParams): Promise<void> {
  await runAgentWorkflow({
    orgId: params.orgId,
    userId: params.userId,
    executeAgentWorkflow: params.executeAgentWorkflow,
    conversationId: params.conversationId ?? null,
    message: params.message,
    input: params.input,
    dealId: params.dealId ?? null,
    jurisdictionId: params.jurisdictionId ?? null,
    sku: params.sku ?? null,
    runType: params.runType,
    maxTurns: params.maxTurns,
    correlationId: params.correlationId,
    persistConversation: params.persistConversation ?? true,
    injectSystemContext: params.injectSystemContext ?? true,
    onEvent: params.onEvent,
  });
}
