import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type { DealIntakeWorkflowInput } from "@entitlement-os/shared";

const {
  loadDeal,
  runParcelTriage,
  createInitialTaskPlan,
  generateArtifact,
  updateRunStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Deal intake workflow:
 * 1. Load the deal from DB
 * 2. Run AI-powered parcel triage
 * 3. Create initial pipeline task plan (tasks 1-8)
 * 4. Generate triage PDF artifact
 * 5. Mark run as succeeded
 */
export async function dealIntakeWorkflow(
  params: DealIntakeWorkflowInput,
): Promise<{
  dealId: string;
  taskCount: number;
  artifactId: string | null;
  queueName: string;
  rerunReason: string;
}> {
  // 1. Load the deal
  const deal = await loadDeal({ dealId: params.dealId });

  // 2. Run AI triage on the parcel
  const triageResult = await runParcelTriage({
    dealId: params.dealId,
    orgId: params.orgId,
    runId: params.runId,
  });

  // 3. Create initial pipeline task plan
  const tasks = await createInitialTaskPlan({
    dealId: params.dealId,
    orgId: params.orgId,
    routing: triageResult.routing,
  });

  // 4. Generate triage PDF
  let artifactId: string | null = null;
  try {
    const artifact = await generateArtifact({
      dealId: params.dealId,
      artifactType: "TRIAGE_PDF",
      orgId: params.orgId,
      runId: params.runId,
    });
    artifactId = artifact.id;
  } catch {
    // Non-fatal: triage PDF generation can fail without blocking the intake
  }

  // 5. Mark run as succeeded
  await updateRunStatus({
    runId: params.runId,
    status: "succeeded",
  });

  return {
    dealId: deal.id,
    taskCount: tasks.length,
    artifactId,
    queueName: triageResult.routing.queueName,
    rerunReason: triageResult.rerun.reason,
  };
}
