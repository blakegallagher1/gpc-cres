import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type { JurisdictionRefreshWorkflowInput } from "@entitlement-os/shared";

const {
  fetchSeedSources,
  captureEvidenceForSource,
  generateParishPack,
  validateAndStorePack,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Refreshes a parish pack for a jurisdiction:
 * 1. Fetch seed source URLs from the DB
 * 2. For each source: capture evidence (fetch + snapshot + extract text)
 * 3. Generate the parish pack via OpenAI using extracted texts
 * 4. Validate and store the new pack version
 */
export async function parishPackRefreshWorkflow(
  params: JurisdictionRefreshWorkflowInput,
): Promise<{ packVersionId: string; sourceCount: number }> {
  // 1. Fetch seed source URLs from DB
  const sources = await fetchSeedSources({
    jurisdictionId: params.jurisdictionId,
  });

  // 2. For each source: capture evidence (fetch + snapshot + extract text)
  const evidenceTexts: string[] = [];
  for (const source of sources) {
    const result = await captureEvidenceForSource({
      url: source.url,
      orgId: params.orgId,
      runId: params.runId,
    });
    evidenceTexts.push(result.extractedText);
  }

  // 3. Generate parish pack via OpenAI
  const pack = await generateParishPack({
    jurisdictionId: params.jurisdictionId,
    sku: params.sku,
    orgId: params.orgId,
    evidenceTexts,
  });

  // 4. Validate and store
  const version = await validateAndStorePack({
    jurisdictionId: params.jurisdictionId,
    sku: params.sku,
    orgId: params.orgId,
    packJson: pack,
    runId: params.runId,
  });

  return { packVersionId: version.id, sourceCount: sources.length };
}
