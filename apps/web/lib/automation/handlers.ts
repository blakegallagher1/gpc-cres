import { registerHandler } from "./events";
import { handleParcelCreated } from "./enrichment";
import { handleTriageReadiness } from "./triage";
import { handleTaskCreated, handleTaskCompleted } from "./taskExecution";
import { handleUploadCreated } from "./documents";
import { handleAdvancement, handleStatusChangeReminder } from "./advancement";
import { handleBuyerOutreach, handleTriageBuyerMatch } from "./buyerOutreach";
import { handleIntakeReceived } from "./intake";

/**
 * Register all automation event handlers.
 * Idempotent — safe to call multiple times.
 * Must be imported before dispatching any events.
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
  registerHandler("deal.statusChanged", handleStatusChangeReminder);

  // #6 Document Management: auto-classify uploads
  registerHandler("upload.created", handleUploadCreated);

  // #10 Buyer Outreach: match buyers when deal reaches EXIT_MARKETED
  registerHandler("deal.statusChanged", handleBuyerOutreach);
  registerHandler("triage.completed", handleTriageBuyerMatch);

  // #1 Deal Intake: auto-create deals from incoming inquiries
  registerHandler("intake.received", handleIntakeReceived);
}

// Auto-register on import
ensureHandlersRegistered();
