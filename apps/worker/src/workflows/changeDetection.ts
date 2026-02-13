import {
  proxyActivities,
  startChild,
  ParentClosePolicy,
} from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type { ChangeDetectionWorkflowInput } from "@entitlement-os/shared";
import { parishPackRefreshWorkflow } from "./parishPackRefresh.js";

const { fetchSeedSources, captureEvidenceForSource, createRunRecord } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: { maximumAttempts: 3 },
  });

/**
 * Scheduled workflow: check all seed sources for a jurisdiction for changes.
 * For each source, capture a fresh evidence snapshot and compare hashes.
 * If any source changed, trigger a parishPackRefreshWorkflow as a child workflow.
 */
export async function changeDetectionWorkflow(
  params: ChangeDetectionWorkflowInput,
): Promise<{ changedCount: number; refreshTriggered: boolean }> {
  const sources = await fetchSeedSources({
    jurisdictionId: params.jurisdictionId,
    officialOnly: true,
  });

  let changedCount = 0;
  for (const source of sources) {
    const result = await captureEvidenceForSource({
      url: source.url,
      orgId: params.orgId,
      runId: params.runId,
    });
    if (result.changed) {
      changedCount++;
    }
  }

  let refreshTriggered = false;
  if (changedCount > 0) {
    // Create a new run record for the refresh
    const refreshRun = await createRunRecord({
      orgId: params.orgId,
      runType: "PARISH_PACK_REFRESH",
      jurisdictionId: params.jurisdictionId,
      status: "running",
    });

    // Trigger parish pack refresh as a child workflow
    await startChild(parishPackRefreshWorkflow, {
      args: [
        {
          orgId: params.orgId,
          jurisdictionId: params.jurisdictionId,
          sku: "SMALL_BAY_FLEX" as const,
          runId: refreshRun.id,
          officialOnly: true,
        },
      ],
      workflowId: `parish-refresh-${params.jurisdictionId}-${Date.now()}`,
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
    });
    refreshTriggered = true;
  }

  return { changedCount, refreshTriggered };
}
