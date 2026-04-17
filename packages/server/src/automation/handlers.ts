import { registerHandler } from "./types";
import { registerChatAnalysisAuditHandler } from "./chat-bridge";
import { handleAdvancement, handleStatusChangeReminder } from "./advancement.service";
import {
  handleAgentLearningOutcomeReinforcement,
} from "./agentLearningOutcomeReinforcement";
import { handleAgentLearningPromotion } from "./agentLearningPromotion";
import {
  handleArtifactOnStatusChange,
  handleTriageArtifactNotification,
} from "./artifactAutomation";
import { handleBuyerOutreach, handleTriageBuyerMatch } from "./buyerOutreach";
import { handleUploadCreated } from "./documents";
import { handleParcelCreated } from "./enrichment";
import { handleEntitlementStrategyAutopilot } from "./entitlementStrategy";
import { handleFinancialInit } from "./financialInit";
import { handleIntakeReceived } from "./intake";
import { handleKnowledgeCapture } from "./knowledgeCapture";
import { handleOutcomeCapture } from "./outcomeCapture";
import { handleTaskCreated, handleTaskCompleted } from "./taskExecution";
import { handleTriageReadiness } from "./triage";

let registered = false;

export function ensureHandlersRegistered(): void {
  if (registered) return;
  registered = true;

  registerHandler("parcel.created", handleParcelCreated);
  registerHandler("parcel.enriched", handleTriageReadiness);
  registerHandler("task.created", handleTaskCreated);
  registerHandler("task.completed", handleTaskCompleted);
  registerHandler("task.completed", handleAdvancement);
  registerHandler("deal.stageChanged", handleStatusChangeReminder);
  registerHandler("upload.created", handleUploadCreated);
  registerHandler("deal.stageChanged", handleBuyerOutreach);
  registerHandler("triage.completed", handleTriageBuyerMatch);
  registerHandler("intake.received", handleIntakeReceived);
  registerHandler("deal.stageChanged", handleArtifactOnStatusChange);
  registerHandler("triage.completed", handleTriageArtifactNotification);
  registerHandler("deal.stageChanged", handleEntitlementStrategyAutopilot);
  registerHandler("triage.completed", handleFinancialInit);
  registerHandler("deal.stageChanged", handleKnowledgeCapture);
  registerHandler("deal.stageChanged", handleOutcomeCapture);
  registerHandler("deal.stageChanged", handleAgentLearningOutcomeReinforcement);
  registerHandler("agent.run.completed", handleAgentLearningPromotion);

  registerChatAnalysisAuditHandler();
}
