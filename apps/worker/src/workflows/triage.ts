import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type { TriageWorkflowInput, TriageWorkflowResult } from "@entitlement-os/shared";

const { createRunRecord, runParcelTriage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

export async function triageWorkflow(
  params: TriageWorkflowInput,
): Promise<TriageWorkflowResult> {
  const run = await createRunRecord({
    orgId: params.orgId,
    dealId: params.dealId,
    runType: "TRIAGE",
    status: "running",
  });

  const result = await runParcelTriage({
    dealId: params.dealId,
    orgId: params.orgId,
    runId: run.id,
  });

  return {
    runId: run.id,
    triage: result.triage,
    triageScore: result.triageScore,
    summary: result.summary,
    scorecard: result.scorecard,
    routing: result.routing,
    rerun: result.rerun,
    sources: result.sources,
    queueName: result.routing.queueName,
    artifactId: null,
  };
}
