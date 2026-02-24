/**
 * Server-side storage via Gateway (B2). Use for artifact generation, evidence uploads.
 * Requires LOCAL_API_URL and LOCAL_API_KEY.
 * For automation (no request context): use systemAuth(orgId) which requires GATEWAY_SERVICE_USER_ID.
 */
import { getGatewayConfig, gatewayHeaders } from "@/lib/gateway-proxy";

export type GatewayAuth = { orgId: string; userId: string };

/** Auth for system/automation context. Requires GATEWAY_SERVICE_USER_ID env var. */
export function systemAuth(orgId: string): GatewayAuth {
  const userId = process.env.GATEWAY_SERVICE_USER_ID?.trim();
  if (!userId) {
    throw new Error("GATEWAY_SERVICE_USER_ID required for server-side storage (automation)");
  }
  return { orgId, userId };
}

async function uploadBytesToGateway(
  formData: FormData,
  auth: GatewayAuth
): Promise<Response> {
  const config = getGatewayConfig();
  if (!config) {
    throw new Error("Storage API requires LOCAL_API_URL and LOCAL_API_KEY");
  }
  return fetch(`${config.url}/storage/upload-bytes`, {
    method: "POST",
    cache: "no-store",
    headers: gatewayHeaders(config.key, auth),
    body: formData,
  });
}

export type UploadArtifactParams = {
  auth: GatewayAuth;
  dealId: string;
  artifactType: string;
  version: number;
  filename: string;
  contentType: string;
  bytes: Buffer;
  generatedByRunId?: string;
};

export async function uploadArtifactToGateway(params: UploadArtifactParams): Promise<{
  id: string;
  storageObjectKey: string;
  artifactType: string;
  version: number;
}> {
  const formData = new FormData();
  formData.append("kind", "artifact");
  formData.append("dealId", params.dealId);
  formData.append("artifactType", params.artifactType);
  formData.append("version", String(params.version));
  formData.append("filename", params.filename);
  formData.append("contentType", params.contentType);
  if (params.generatedByRunId) {
    formData.append("generatedByRunId", params.generatedByRunId);
  }
  formData.append("file", new Blob([new Uint8Array(params.bytes)]), params.filename);

  const res = await uploadBytesToGateway(formData, params.auth);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.detail === "string" ? data.detail : data?.error || "Artifact upload failed"
    );
  }
  return res.json() as Promise<{
    id: string;
    storageObjectKey: string;
    artifactType: string;
    version: number;
  }>;
}

export async function fetchObjectBytesFromGateway(
  objectKey: string,
  auth: GatewayAuth
): Promise<ArrayBuffer> {
  const config = getGatewayConfig();
  if (!config) {
    throw new Error("Storage API requires LOCAL_API_URL and LOCAL_API_KEY");
  }
  const res = await fetch(
    `${config.url}/storage/object-bytes?key=${encodeURIComponent(objectKey)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: gatewayHeaders(config.key, auth),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.detail === "string" ? data.detail : data?.error || "Download failed"
    );
  }
  return res.arrayBuffer();
}

export type UploadEvidenceBytesParams = {
  auth: GatewayAuth;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
  kind: "evidence_snapshot" | "evidence_extract";
};

export async function uploadEvidenceBytesToGateway(
  params: UploadEvidenceBytesParams
): Promise<{ objectKey: string }> {
  const formData = new FormData();
  formData.append("kind", params.kind);
  formData.append("objectKey", params.objectKey);
  formData.append("contentType", params.contentType);
  const bytes = new Uint8Array(params.bytes.length);
  bytes.set(params.bytes);
  formData.append("file", new Blob([bytes]), params.objectKey.split("/").pop() ?? "file");

  const res = await uploadBytesToGateway(formData, params.auth);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.detail === "string" ? data.detail : data?.error || "Evidence upload failed"
    );
  }
  return res.json() as Promise<{ objectKey: string }>;
}

export type GetDownloadUrlParams = {
  auth: GatewayAuth;
  id: string;
  type: "upload" | "artifact" | "evidence_snapshot" | "evidence_extract";
};

export async function getDownloadUrlFromGateway(
  params: GetDownloadUrlParams
): Promise<{ downloadUrl: string }> {
  const config = getGatewayConfig();
  if (!config) {
    throw new Error("Storage API requires LOCAL_API_URL and LOCAL_API_KEY");
  }
  const res = await fetch(
    `${config.url}/storage/download-url?id=${encodeURIComponent(params.id)}&type=${params.type}`,
    {
      method: "GET",
      cache: "no-store",
      headers: gatewayHeaders(config.key, params.auth),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.detail === "string" ? data.detail : data?.error || "Failed to get download URL"
    );
  }
  const data = (await res.json()) as { downloadUrl?: string };
  if (!data?.downloadUrl) {
    throw new Error("Invalid response from storage API");
  }
  return { downloadUrl: data.downloadUrl };
}
