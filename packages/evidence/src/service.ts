import type { SupabaseClient } from "@supabase/supabase-js";

import type { PrismaClient } from "@entitlement-os/db";

import { compareEvidenceHash } from "./compare.js";
import { fetchAndSnapshotUrl } from "./snapshot.js";
import type { EvidenceSnapshotResult } from "./types.js";

export type CaptureEvidenceParams = {
  url: string;
  orgId: string;
  runId: string;
  prisma: PrismaClient;
  supabase: SupabaseClient;
  evidenceBucket?: string;
  allowPlaywrightFallback?: boolean;
  officialDomains?: string[];
};

export type CaptureEvidenceResult = {
  sourceId: string;
  snapshotId: string;
  contentHash: string;
  changed: boolean;
  storageObjectKey: string;
  textExtractObjectKey: string;
  extractedText: string;
  usedPlaywright: boolean;
};

/**
 * Full evidence capture pipeline:
 * 1. Fetch URL content (HTTP with optional Playwright fallback)
 * 2. Hash content
 * 3. Upload snapshot + text extract to Supabase Storage
 * 4. Store records in DB via Prisma
 * 5. Compare with previous snapshot to detect changes
 *
 * This is the high-level entry point that wraps fetchAndSnapshotUrl with
 * change detection.
 */
export async function captureEvidence(params: CaptureEvidenceParams): Promise<CaptureEvidenceResult> {
  const bucket = params.evidenceBucket ?? "evidence";

  const snapshot: EvidenceSnapshotResult = await fetchAndSnapshotUrl({
    orgId: params.orgId,
    runId: params.runId,
    url: params.url,
    allowPlaywrightFallback: params.allowPlaywrightFallback ?? false,
    prisma: params.prisma,
    supabase: params.supabase,
    evidenceBucket: bucket,
    officialDomains: params.officialDomains,
  });

  // Compare the new content hash against any *previous* snapshots (excluding the one we just created).
  const comparison = await compareEvidenceHash({
    prisma: params.prisma,
    sourceId: snapshot.evidenceSourceId,
    currentHash: snapshot.contentHash,
  });

  // If the only snapshot is the one we just created, it's the first capture -> changed = true.
  // If there was a previous snapshot, comparison.changed reflects whether content differs.
  // The comparison query returns the most recent snapshot which may be the one we just created,
  // so we check if the previous snapshot ID differs from the current one.
  const isFirstCapture = comparison.previousSnapshotId === null
    || comparison.previousSnapshotId === snapshot.evidenceSnapshotId;

  return {
    sourceId: snapshot.evidenceSourceId,
    snapshotId: snapshot.evidenceSnapshotId,
    contentHash: snapshot.contentHash,
    changed: isFirstCapture ? true : comparison.changed,
    storageObjectKey: snapshot.storageObjectKey,
    textExtractObjectKey: snapshot.textExtractObjectKey,
    extractedText: snapshot.extractedText,
    usedPlaywright: snapshot.usedPlaywright,
  };
}
