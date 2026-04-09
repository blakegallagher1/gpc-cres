import type { QueryIntent } from "@entitlement-os/openai";
import type {
  AgentInputMessage,
  AgentStreamEvent,
} from "@entitlement-os/shared";
import type { ResearchLaneSelection } from "@entitlement-os/shared/research-routing";
import type { AgentExecutionResult } from "./run-state";

type CuaModelPreference = "gpt-5.4" | "gpt-5.4-mini";

export interface ExecuteAgentWorkflowParams {
  orgId: string;
  userId: string;
  conversationId?: string;
  input: AgentInputMessage[];
  runId?: string;
  runType?: string;
  maxTurns?: number;
  dealId?: string;
  jurisdictionId?: string;
  sku?: string;
  intentHint?: string;
  queryIntentOverride?: QueryIntent;
  researchLaneOverride?: ResearchLaneSelection;
  onEvent?: (event: AgentStreamEvent) => void;
  correlationId?: string;
  preferredCuaModel?: CuaModelPreference;
  retryMode?: string;
  retryAttempts?: number;
  retryMaxAttempts?: number;
  fallbackLineage?: string[];
  fallbackReason?: string;
  executionLeaseToken?: string;
  resumedRunState?: string;
  previousResponseId?: string | null;
  toolApprovalDecision?: {
    toolCallId: string;
    action: "approve" | "reject";
  };
  skipRunPersistence?: boolean;
}

export type ExecuteAgentWorkflow = (
  params: ExecuteAgentWorkflowParams,
) => Promise<AgentExecutionResult>;
