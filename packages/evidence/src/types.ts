import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@entitlement-os/db";

export type EvidenceSnapshotResult = {
  evidenceSourceId: string;
  evidenceSnapshotId: string;
  retrievedAt: Date;
  httpStatus: number | null;
  contentType: string | null;
  contentHash: string;
  storageObjectKey: string;
  textExtractObjectKey: string;
  extractedText: string;
  usedPlaywright: boolean;
};

export type FetchAndSnapshotUrlParams = {
  orgId: string;
  runId: string;
  jurisdictionId?: string;
  url: string;
  allowPlaywrightFallback: boolean;
  prisma: PrismaClient;
  supabase: SupabaseClient;
  evidenceBucket: string;
  officialDomains?: string[];
};
