import type { AgentReport } from "@entitlement-os/shared";
import type { DataAgentRetrievalContext } from "@entitlement-os/shared";
import type { QueryIntent } from "@entitlement-os/openai";
import {
  runAgentPostRunEffects as runAgentPostRunEffectsImpl,
  type AgentPostRunEffectsTrustEnvelope,
} from "@gpc/server/chat/agent-post-run-effects.service";
import type { AgentTrustEnvelope } from "@/types";
import { autoFeedRun } from "@/lib/agent/dataAgentAutoFeed.service";
import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { dispatchChatAutomationEvent } from "@gpc/server/automation/chat-events";
import { logger } from "./loggerAdapter";

/**
 * Runs the asynchronous side effects that happen after a local agent run is
 * persisted: learning promotion dispatch, auto-feed, and critic evaluation.
 */
export async function runAgentPostRunEffects(params: {
  runId: string;
  orgId: string;
  userId: string;
  conversationId?: string | null;
  dealId?: string | null;
  jurisdictionId?: string | null;
  runType?: string | null;
  status: "running" | "succeeded" | "failed" | "canceled";
  firstUserInput: unknown;
  queryIntent: QueryIntent | null;
  skipRunPersistence: boolean;
  ingestionOnly: boolean;
  finalText: string;
  finalReport: AgentReport | null;
  trust: AgentTrustEnvelope;
  retrievalContext: DataAgentRetrievalContext | null;
  retrievalSummary: Record<string, unknown>;
}): Promise<void> {
  await runAgentPostRunEffectsImpl(
    {
      ...params,
      trust: params.trust as AgentPostRunEffectsTrustEnvelope,
    },
    {
      agentLearningEnabled: AUTOMATION_CONFIG.agentLearning.enabled,
      dispatchAgentRunCompleted: dispatchChatAutomationEvent,
      autoFeedRun,
      warn: (message, fields) => {
        logger.warn(message, fields);
      },
    },
  );
}
