import type { SupabaseClient } from "@supabase/supabase-js";

import { buildEvidenceExtractObjectKey, buildEvidenceSnapshotObjectKey } from "@entitlement-os/shared";

import { detectExtension } from "./util.js";

/**
 * Upload bytes to a Supabase Storage bucket.
 * Treats "already exists" as success (deterministic keys include content hash).
 */
async function uploadToSupabase(params: {
  supabase: SupabaseClient;
  bucket: string;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { error } = await params.supabase.storage
    .from(params.bucket)
    .upload(params.objectKey, params.bytes, {
      contentType: params.contentType,
      upsert: false,
    });

  if (!error) return;

  const msg = String(error.message ?? "");
  if (msg.toLowerCase().includes("already exists")) return;
  throw new Error(`Evidence upload failed: ${error.message}`);
}

export type UploadEvidenceParams = {
  supabase: SupabaseClient;
  bucket: string;
  orgId: string;
  sourceId: string;
  content: Uint8Array;
  contentType: string;
  contentHash: string;
  retrievedAt: Date;
  url: string;
};

/**
 * Upload an evidence snapshot to Supabase Storage.
 * Returns the deterministic storage object key.
 */
export async function uploadEvidence(params: UploadEvidenceParams): Promise<{ storageObjectKey: string }> {
  const extension = detectExtension(params.contentType, params.url);

  const storageObjectKey = buildEvidenceSnapshotObjectKey({
    orgId: params.orgId,
    sourceId: params.sourceId,
    retrievedAt: params.retrievedAt,
    contentHash: params.contentHash,
    extension,
  });

  await uploadToSupabase({
    supabase: params.supabase,
    bucket: params.bucket,
    objectKey: storageObjectKey,
    bytes: params.content,
    contentType: params.contentType,
  });

  return { storageObjectKey };
}

export type UploadTextExtractParams = {
  supabase: SupabaseClient;
  bucket: string;
  orgId: string;
  sourceId: string;
  text: string;
  contentHash: string;
  retrievedAt: Date;
};

/**
 * Upload a text extract to Supabase Storage.
 * Returns the deterministic text extract object key.
 */
export async function uploadTextExtract(params: UploadTextExtractParams): Promise<{ textExtractObjectKey: string }> {
  const textExtractObjectKey = buildEvidenceExtractObjectKey({
    orgId: params.orgId,
    sourceId: params.sourceId,
    retrievedAt: params.retrievedAt,
    contentHash: params.contentHash,
  });

  await uploadToSupabase({
    supabase: params.supabase,
    bucket: params.bucket,
    objectKey: textExtractObjectKey,
    bytes: new TextEncoder().encode(params.text),
    contentType: "text/plain; charset=utf-8",
  });

  return { textExtractObjectKey };
}
