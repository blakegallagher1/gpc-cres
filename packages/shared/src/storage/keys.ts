import path from "node:path";

function toUrlSafeIsoTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "-");
}

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  return base.replaceAll("..", ".").replaceAll("/", "_").replaceAll("\\\\", "_");
}

export function buildArtifactObjectKey(params: {
  orgId: string;
  dealId: string;
  artifactType: string;
  version: number;
  filename: string;
}): string {
  const filename = sanitizeFilename(params.filename);
  return `artifacts/${params.orgId}/deals/${params.dealId}/${params.artifactType}/v${params.version}/${filename}`;
}

export function buildEvidenceSnapshotObjectKey(params: {
  orgId: string;
  sourceId: string;
  retrievedAt: Date;
  contentHash: string;
  extension: string;
}): string {
  const ext = params.extension.startsWith(".") ? params.extension.slice(1) : params.extension;
  const retrievedAtISO = toUrlSafeIsoTimestamp(params.retrievedAt);
  return `evidence/${params.orgId}/sources/${params.sourceId}/snapshots/${retrievedAtISO}/${params.contentHash}.${ext}`;
}

export function buildEvidenceExtractObjectKey(params: {
  orgId: string;
  sourceId: string;
  retrievedAt: Date;
  contentHash: string;
}): string {
  const retrievedAtISO = toUrlSafeIsoTimestamp(params.retrievedAt);
  return `evidence/${params.orgId}/sources/${params.sourceId}/extracts/${retrievedAtISO}/${params.contentHash}.txt`;
}

export function buildUploadObjectKey(params: {
  orgId: string;
  dealId: string;
  kind: string;
  uploadedAt: Date;
  uploadId: string;
  filename: string;
}): string {
  const uploadedAtISO = toUrlSafeIsoTimestamp(params.uploadedAt);
  const filename = sanitizeFilename(params.filename);
  return `uploads/${params.orgId}/deals/${params.dealId}/${params.kind}/${uploadedAtISO}/${params.uploadId}/${filename}`;
}

