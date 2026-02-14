import { hashJsonSha256 } from "./crypto/index.js";

export type EvidenceCitation = {
  tool?: string;
  url?: string;
  sourceId?: string;
  snapshotId?: string;
  contentHash?: string;
  isOfficial?: boolean;
};

export type SourceCaptureManifestEntry = {
  sourceUrl: string;
  jurisdictionId: string;
  evidenceSourceId?: string | null;
  evidenceSnapshotId?: string | null;
  contentHash?: string | null;
  captureAttempts: number;
  captureSuccess: boolean;
  captureError: string | null;
  qualityBucket: string;
};

function canonicalCitationKey(citation: EvidenceCitation): string | null {
  if (citation.snapshotId) return `snapshot:${citation.snapshotId}`;
  if (citation.sourceId) return `source:${citation.sourceId}`;
  if (citation.url && citation.contentHash) {
    return `url:${citation.url}#hash:${citation.contentHash}`;
  }
  if (citation.url) return `url:${citation.url}`;
  if (citation.contentHash) return `hash:${citation.contentHash}`;
  return null;
}

export function dedupeEvidenceCitations(
  citations: EvidenceCitation[],
): EvidenceCitation[] {
  const seen = new Set<string>();
  const deduped: EvidenceCitation[] = [];

  for (const citation of citations) {
    const key = canonicalCitationKey(citation);
    if (!key) {
      deduped.push(citation);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(citation);
  }

  return deduped;
}

function normalizeCitationForHash(citation: EvidenceCitation): string {
  const normalized = {
    contentHash: citation.contentHash ?? "",
    isOfficial: citation.isOfficial ? 1 : 0,
    snapshotId: citation.snapshotId ?? "",
    sourceId: citation.sourceId ?? "",
    tool: citation.tool ?? "",
    url: citation.url ?? "",
  };
  return JSON.stringify(normalized);
}

export function computeEvidenceHash(citations: EvidenceCitation[]): string | null {
  const deduped = dedupeEvidenceCitations(citations);
  if (deduped.length === 0) return null;
  const normalized = deduped
    .map(normalizeCitationForHash)
    .sort((a, b) => a.localeCompare(b));
  return hashJsonSha256(normalized);
}

export function computeSourceCaptureManifestHash(
  entries: readonly SourceCaptureManifestEntry[],
): string {
  const ordered = [...entries].sort((left, right) => {
    if (left.sourceUrl === right.sourceUrl) {
      return left.jurisdictionId.localeCompare(right.jurisdictionId);
    }
    return left.sourceUrl.localeCompare(right.sourceUrl);
  });

  return hashJsonSha256({
    entries: ordered.map((entry) => ({
      sourceUrl: entry.sourceUrl,
      evidenceSourceId: entry.evidenceSourceId ?? null,
      evidenceSnapshotId: entry.evidenceSnapshotId ?? null,
      contentHash: entry.contentHash ?? null,
      captureAttempts: entry.captureAttempts,
      captureSuccess: entry.captureSuccess,
      captureError: entry.captureError,
      qualityBucket: entry.qualityBucket,
    })),
  });
}
