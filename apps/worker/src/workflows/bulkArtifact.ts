import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type {
  ArtifactGenerationWorkflowInput,
  ArtifactType,
} from "@entitlement-os/shared";

const { generateArtifact, updateRunStatus } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Generate multiple artifacts for a deal in sequence.
 * Each artifact type gets its own run record (passed in via runIdsByArtifactType).
 */
export async function bulkArtifactWorkflow(
  params: ArtifactGenerationWorkflowInput,
): Promise<{ results: Array<{ artifactType: ArtifactType; artifactId: string | null; error: string | null }> }> {
  const results: Array<{
    artifactType: ArtifactType;
    artifactId: string | null;
    error: string | null;
  }> = [];

  for (const artifactType of params.artifactTypes) {
    const runId = params.runIdsByArtifactType[artifactType];
    try {
      const artifact = await generateArtifact({
        dealId: params.dealId,
        artifactType,
        orgId: params.orgId,
        runId: runId ?? undefined,
      });
      results.push({ artifactType, artifactId: artifact.id, error: null });

      if (runId) {
        await updateRunStatus({ runId, status: "succeeded" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ artifactType, artifactId: null, error: message });

      if (runId) {
        await updateRunStatus({ runId, status: "failed" });
      }
    }
  }

  return { results };
}
