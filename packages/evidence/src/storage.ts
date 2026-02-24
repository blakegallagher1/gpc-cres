/**
 * Evidence storage via Gateway (B2). Single upload path for all evidence flows.
 * Requires: LOCAL_API_URL, LOCAL_API_KEY, GATEWAY_SERVICE_USER_ID.
 */

export type UploadEvidenceParams = {
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
  kind: "evidence_snapshot" | "evidence_extract";
  orgId: string;
};

function getGatewayConfig(): { url: string; key: string; userId: string } {
  const url = process.env.LOCAL_API_URL?.trim();
  const key = process.env.LOCAL_API_KEY?.trim();
  const userId = process.env.GATEWAY_SERVICE_USER_ID?.trim();
  if (!url || !key || !userId) {
    throw new Error(
      "Evidence storage requires LOCAL_API_URL, LOCAL_API_KEY, and GATEWAY_SERVICE_USER_ID"
    );
  }
  return { url: url.replace(/\/$/, ""), key, userId };
}

/**
 * Upload evidence bytes to B2 via the gateway.
 */
export async function uploadEvidenceBytesViaGateway(
  params: UploadEvidenceParams
): Promise<void> {
  const config = getGatewayConfig();
  const formData = new FormData();
  formData.append("kind", params.kind);
  formData.append("objectKey", params.objectKey);
  formData.append("contentType", params.contentType);
  const bytes = new Uint8Array(params.bytes.length);
  bytes.set(params.bytes);
  formData.append(
    "file",
    new Blob([bytes]),
    params.objectKey.split("/").pop() ?? "file"
  );

  const res = await fetch(`${config.url}/storage/upload-bytes`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "X-Org-Id": params.orgId,
      "X-User-Id": config.userId,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      typeof data?.detail === "string" ? data.detail : "Evidence upload failed"
    );
  }
}
