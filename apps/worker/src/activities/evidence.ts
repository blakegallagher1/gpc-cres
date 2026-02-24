import { prisma } from "@entitlement-os/db";
import { captureEvidence } from "@entitlement-os/evidence";

function isOfficialSource(url: string, officialDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * Fetch seed source URLs for a jurisdiction from the database.
 */
export async function fetchSeedSources(params: {
  jurisdictionId: string;
  officialOnly?: boolean;
  officialDomains?: string[];
}): Promise<Array<{ id: string; url: string; purpose: string; isOfficial: boolean }>> {
  const sources = await prisma.jurisdictionSeedSource.findMany({
    where: { jurisdictionId: params.jurisdictionId, active: true },
    select: {
      id: true,
      url: true,
      purpose: true,
      jurisdiction: {
        select: { officialDomains: true },
      },
    },
  });
  const officialDomains =
    params.officialDomains ??
    sources[0]?.jurisdiction.officialDomains ??
    [];

  const filtered = params.officialOnly
    ? sources.filter((source: { url: string }) => isOfficialSource(source.url, officialDomains))
    : sources;

  return filtered.map((source: { id: string; url: string; purpose: string }) => ({
    id: source.id,
    url: source.url,
    purpose: source.purpose,
    isOfficial: isOfficialSource(source.url, officialDomains),
  }));
}

/**
 * Capture evidence for a single source URL:
 * fetch content, snapshot to storage, extract text, detect changes.
 */
export async function captureEvidenceForSource(params: {
  url: string;
  orgId: string;
  runId: string;
  officialDomains?: string[];
}): Promise<{
  sourceId: string;
  snapshotId: string;
  contentHash: string;
  changed: boolean;
  extractedText: string;
}> {
  const result = await captureEvidence({
    url: params.url,
    orgId: params.orgId,
    runId: params.runId,
    prisma,
    allowPlaywrightFallback: true,
    officialDomains: params.officialDomains,
  });

  return {
    sourceId: result.sourceId,
    snapshotId: result.snapshotId,
    contentHash: result.contentHash,
    changed: result.changed,
    extractedText: result.extractedText,
  };
}
