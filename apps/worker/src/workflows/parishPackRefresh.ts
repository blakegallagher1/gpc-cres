import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "../activities/index.js";
import type { JurisdictionRefreshWorkflowInput } from "@entitlement-os/shared";

const {
  fetchSeedSources,
  captureEvidenceForSource,
  generateParishPack,
  validateAndStorePack,
  hashPackInput,
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
  const officialOnly = params.officialOnly ?? true;
  const getHost = (url: string): string | null => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  };

  // 1. Fetch seed source URLs from DB
  const sources = await fetchSeedSources({
    jurisdictionId: params.jurisdictionId,
    officialOnly,
  });

  const officialDomains = Array.from(
    new Set(
      sources
        .filter((source) => source.isOfficial)
        .map((source) => getHost(source.url))
        .filter((host): host is string => host !== null),
    ),
  );

  // 2. For each source: capture evidence (fetch + snapshot + extract text)
  const evidenceTexts: string[] = [];
  const sourceIds: string[] = [];
  const snapshotIds: string[] = [];
  const contentHashes: string[] = [];
  for (const source of sources) {
    const result = await captureEvidenceForSource({
      url: source.url,
      orgId: params.orgId,
      runId: params.runId,
      officialDomains,
    });
    evidenceTexts.push(result.extractedText);
    sourceIds.push(result.sourceId);
    snapshotIds.push(result.snapshotId);
    contentHashes.push(result.contentHash);
  }

  // 3. Generate parish pack via OpenAI
  const sourceUrls = sources.map((source) => source.url);
  const pack = await generateParishPack({
    jurisdictionId: params.jurisdictionId,
    sku: params.sku,
    evidenceTexts,
    sourceUrls,
    officialOnly,
  });

  const sourceSummary = Array.isArray((pack as { sources_summary?: unknown }).sources_summary)
    ? ((pack as { sources_summary?: unknown[] }).sources_summary?.filter(
        (item): item is string => typeof item === "string"
      ) ?? [])
    : [];
  const packInputHash = await hashPackInput({
    jurisdictionId: params.jurisdictionId,
    sku: params.sku,
    officialOnly,
    sourceEvidenceIds: sourceIds,
    sourceSnapshotIds: snapshotIds,
    sourceContentHashes: contentHashes,
    sourceUrls: sourceUrls,
    sourceSummary,
  });

  // 4. Validate and store
  const version = await validateAndStorePack({
    jurisdictionId: params.jurisdictionId,
    sku: params.sku,
    orgId: params.orgId,
    packJson: pack,
    runId: params.runId,
    sourceEvidenceIds: sourceIds,
    sourceSnapshotIds: snapshotIds,
    sourceContentHashes: contentHashes,
    sourceUrls,
    officialOnly,
    inputHash: packInputHash,
  });

  return { packVersionId: version.id, sourceCount: sources.length };
}
