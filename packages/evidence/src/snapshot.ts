import type { SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

import type { PrismaClient } from "@entitlement-os/db";
import { buildEvidenceExtractObjectKey, buildEvidenceSnapshotObjectKey } from "@entitlement-os/shared";
import { hashBytesSha256 } from "@entitlement-os/shared/crypto";

import { extractTextFromHtml, extractTextFromPdfBytes } from "./textExtract.js";
import { detectExtension, getHostname, looksLikeJsPlaceholder } from "./util.js";
import type { EvidenceSnapshotResult, FetchAndSnapshotUrlParams } from "./types.js";

type FetchBytesResult = {
  bytes: Uint8Array;
  contentType: string | null;
  httpStatus: number | null;
  usedPlaywright: boolean;
};

type BucketConfig = {
  public: boolean;
};

async function ensureBucket(
  supabase: SupabaseClient,
  bucket: string,
): Promise<void> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Evidence bucket lookup failed: ${listError.message}`);
  }

  if (buckets?.some((item) => item.name === bucket)) return;

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
  } as BucketConfig);
  if (error) {
    throw new Error(`Evidence bucket create failed: ${error.message}`);
  }
}

async function fetchBytesViaHttp(url: string): Promise<FetchBytesResult> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "EntitlementOS/1.0 (+evidence-snapshot)",
    },
  });

  const contentType = res.headers.get("content-type");
  const httpStatus = res.status;

  const ab = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(ab),
    contentType,
    httpStatus,
    usedPlaywright: false,
  };
}

async function fetchHtmlViaPlaywright(url: string): Promise<FetchBytesResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const html = await page.content();
    return {
      bytes: new TextEncoder().encode(html),
      contentType: "text/html; charset=utf-8",
      httpStatus: 200,
      usedPlaywright: true,
    };
  } finally {
    await browser.close();
  }
}

async function uploadBytesToSupabase(params: {
  supabase: SupabaseClient;
  bucket: string;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  await ensureBucket(params.supabase, params.bucket);

  const { error } = await params.supabase.storage.from(params.bucket).upload(params.objectKey, params.bytes, {
    contentType: params.contentType,
    upsert: false,
  });

  if (!error) return;

  // Idempotency: deterministic keys include a content hash. If the object already exists, treat as success.
  const msg = String(error.message ?? "");
  if (msg.toLowerCase().includes("already exists")) return;
  throw error;
}

function isOfficialDomain(hostname: string | null, officialDomains: string[]): boolean {
  if (!hostname) return false;
  return officialDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

async function upsertEvidenceSource(params: {
  prisma: PrismaClient;
  orgId: string;
  url: string;
  officialDomains: string[];
}): Promise<{ id: string; isOfficial: boolean; domain: string | null }> {
  const domain = getHostname(params.url);
  const isOfficial = isOfficialDomain(domain, params.officialDomains);

  const source = await params.prisma.evidenceSource.upsert({
    where: {
      orgId_url: {
        orgId: params.orgId,
        url: params.url,
      },
    },
    create: {
      orgId: params.orgId,
      url: params.url,
      domain: domain ?? "",
      isOfficial,
      firstSeenAt: new Date(),
    },
    update: {
      // Keep the original "firstSeenAt". Allow domain/official status to be updated.
      domain: domain ?? "",
      isOfficial,
    },
    select: { id: true, isOfficial: true, domain: true },
  });

  return { id: source.id, isOfficial: source.isOfficial, domain: source.domain };
}

async function createEvidenceSnapshotRow(params: {
  prisma: PrismaClient;
  orgId: string;
  evidenceSourceId: string;
  retrievedAt: Date;
  httpStatus: number | null;
  contentType: string | null;
  contentHash: string;
  storageObjectKey: string;
  textExtractObjectKey: string;
  runId: string;
}): Promise<{ id: string }> {
  return await params.prisma.evidenceSnapshot.create({
    data: {
      orgId: params.orgId,
      evidenceSourceId: params.evidenceSourceId,
      retrievedAt: params.retrievedAt,
      httpStatus: params.httpStatus ?? 0,
      contentType: params.contentType ?? "application/octet-stream",
      contentHash: params.contentHash,
      storageObjectKey: params.storageObjectKey,
      textExtractObjectKey: params.textExtractObjectKey,
      runId: params.runId,
    },
    select: { id: true },
  });
}

export async function fetchAndSnapshotUrl(
  params: FetchAndSnapshotUrlParams,
): Promise<EvidenceSnapshotResult> {
  const officialDomains = params.officialDomains ?? [];
  const evidenceSource = await upsertEvidenceSource({
    prisma: params.prisma,
    orgId: params.orgId,
    url: params.url,
    officialDomains,
  });

  const retrievedAt = new Date();

  let fetchResult = await fetchBytesViaHttp(params.url);

  // Playwright fallback only for HTML-ish responses and only if enabled.
  if (
    params.allowPlaywrightFallback &&
    !String(fetchResult.contentType ?? "").toLowerCase().includes("application/pdf")
  ) {
    try {
      const asText = new TextDecoder().decode(fetchResult.bytes);
      const shouldFallback =
        looksLikeJsPlaceholder(asText) || (fetchResult.httpStatus && fetchResult.httpStatus >= 400);
      if (shouldFallback) {
        fetchResult = await fetchHtmlViaPlaywright(params.url);
      }
    } catch {
      // If decoding fails, do nothing.
    }
  }

  const contentHash = hashBytesSha256(fetchResult.bytes);
  const extension = detectExtension(fetchResult.contentType, params.url);

  const storageObjectKey = buildEvidenceSnapshotObjectKey({
    orgId: params.orgId,
    sourceId: evidenceSource.id,
    retrievedAt,
    contentHash,
    extension,
  });
  const textExtractObjectKey = buildEvidenceExtractObjectKey({
    orgId: params.orgId,
    sourceId: evidenceSource.id,
    retrievedAt,
    contentHash,
  });

  const contentType = fetchResult.contentType ?? "application/octet-stream";

  let extractedText = "";
  if (contentType.toLowerCase().includes("application/pdf") || extension.toLowerCase() === ".pdf") {
    extractedText = await extractTextFromPdfBytes(fetchResult.bytes);
  } else {
    extractedText = await extractTextFromHtml(new TextDecoder().decode(fetchResult.bytes));
  }

  // Upload snapshot + text extract (best-effort to keep deterministic).
  await uploadBytesToSupabase({
    supabase: params.supabase,
    bucket: params.evidenceBucket,
    objectKey: storageObjectKey,
    bytes: fetchResult.bytes,
    contentType,
  });
  await uploadBytesToSupabase({
    supabase: params.supabase,
    bucket: params.evidenceBucket,
    objectKey: textExtractObjectKey,
    bytes: new TextEncoder().encode(extractedText),
    contentType: "text/plain; charset=utf-8",
  });

  const snapshotRow = await createEvidenceSnapshotRow({
    prisma: params.prisma,
    orgId: params.orgId,
    evidenceSourceId: evidenceSource.id,
    retrievedAt,
    httpStatus: fetchResult.httpStatus,
    contentType,
    contentHash,
    storageObjectKey,
    textExtractObjectKey,
    runId: params.runId,
  });

  return {
    evidenceSourceId: evidenceSource.id,
    evidenceSnapshotId: snapshotRow.id,
    retrievedAt,
    httpStatus: fetchResult.httpStatus,
    contentType,
    contentHash,
    storageObjectKey,
    textExtractObjectKey,
    extractedText,
    usedPlaywright: fetchResult.usedPlaywright,
  };
}
