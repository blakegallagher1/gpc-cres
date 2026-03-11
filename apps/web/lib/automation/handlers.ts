import { registerHandler } from "./events";
import { handleParcelCreated } from "./enrichment";
import { handleTriageReadiness } from "./triage";
import { handleTaskCreated, handleTaskCompleted } from "./taskExecution";
import { handleUploadCreated } from "./documents";
import { handleAdvancement, handleStatusChangeReminder } from "./advancement";
import { handleBuyerOutreach, handleTriageBuyerMatch } from "./buyerOutreach";
import { handleIntakeReceived } from "./intake";
import { handleArtifactOnStatusChange, handleTriageArtifactNotification } from "./artifactAutomation";
import { handleEntitlementStrategyAutopilot } from "./entitlementStrategy";
import { handleKnowledgeCapture } from "./knowledgeCapture";
import { handleFinancialInit } from "./financialInit";
import { handleOutcomeCapture } from "./outcomeCapture";

/**
 * Register all automation event handlers.
 * Idempotent — safe to call multiple times.
 * Called lazily by dispatchEvent to keep route imports auth-safe.
 */
let registered = false;

export function ensureHandlersRegistered(): void {
  if (registered) return;
  registered = true;

  // #2 Parcel Enrichment: auto-enrich on parcel creation
  registerHandler("parcel.created", handleParcelCreated);

  // #3 Auto-Triage: detect when deal is ready for triage
  registerHandler("parcel.enriched", handleTriageReadiness);

  // #4 Task Execution: detect agent-executable tasks + quality check
  registerHandler("task.created", handleTaskCreated);
  registerHandler("task.completed", handleTaskCompleted);

  // #5 Stage Advancement: suggest advancing when step tasks are done
  registerHandler("task.completed", handleAdvancement);
  registerHandler("deal.stageChanged", handleStatusChangeReminder);

  // #6 Document Management: auto-classify uploads
  registerHandler("upload.created", handleUploadCreated);

  // #10 Buyer Outreach: match buyers when deal reaches workflow disposition
  registerHandler("deal.stageChanged", handleBuyerOutreach);
  registerHandler("triage.completed", handleTriageBuyerMatch);

  // #1 Deal Intake: auto-create deals from incoming inquiries
  // intake.received: Future email/webhook integration hook.
  // Handler is registered but no API route or job dispatches this event yet.
  // To enable: implement email parser → dispatchEvent({ type: "intake.received", ... })
  registerHandler("intake.received", handleIntakeReceived);

  // #9 Artifact Auto-Generation: BUYER_TEASER on workflow disposition + triage notification
  registerHandler("deal.stageChanged", handleArtifactOnStatusChange);
  registerHandler("triage.completed", handleTriageArtifactNotification);

  // #11 Entitlement Strategy Autopilot: entitlement underwriting recommendation materialization
  registerHandler("deal.stageChanged", handleEntitlementStrategyAutopilot);

  // #E1 Financial Model Auto-Initialization
  registerHandler("triage.completed", handleFinancialInit);

  // #E5 Automated Knowledge Capture: persist terminal deal learnings
  registerHandler("deal.stageChanged", handleKnowledgeCapture);

  // #MEM-003 Calibration v1: snapshot outcomes + ingest calibration records
  registerHandler("deal.stageChanged", handleOutcomeCapture);
}
