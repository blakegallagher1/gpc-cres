import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  ensureDealUploadAccessMock,
  listUploadsForDealMock,
  createUploadRecordForDealMock,
  uploadDealFileToGatewayMock,
  buildUploadObjectKeyMock,
  randomUuidMock,
  dispatchEventMock,
  captureAutomationDispatchErrorMock,
  captureExceptionMock,
  flushMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  ensureDealUploadAccessMock: vi.fn(),
  listUploadsForDealMock: vi.fn(),
  createUploadRecordForDealMock: vi.fn(),
  uploadDealFileToGatewayMock: vi.fn(),
  buildUploadObjectKeyMock: vi.fn(),
  randomUuidMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  captureAutomationDispatchErrorMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  flushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  ensureDealUploadAccess: ensureDealUploadAccessMock,
  listUploadsForDeal: listUploadsForDealMock,
  createUploadRecordForDeal: createUploadRecordForDealMock,
}));

vi.mock("@entitlement-os/shared", () => ({
  buildUploadObjectKey: buildUploadObjectKeyMock,
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  uploadDealFileToGateway: uploadDealFileToGatewayMock,
}));

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    randomUUID: randomUuidMock,
  };
});

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureAutomationDispatchError: captureAutomationDispatchErrorMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  flush: flushMock,
}));

import { GET, POST } from "./route";

describe("/api/deals/[id]/uploads route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    ensureDealUploadAccessMock.mockReset();
    ensureDealUploadAccessMock.mockResolvedValue(undefined);
    listUploadsForDealMock.mockReset();
    createUploadRecordForDealMock.mockReset();
    uploadDealFileToGatewayMock.mockReset();
    buildUploadObjectKeyMock.mockReset();
    randomUuidMock.mockReset();
    dispatchEventMock.mockReset();
    captureAutomationDispatchErrorMock.mockReset();
    captureExceptionMock.mockReset();
    flushMock.mockReset();
    flushMock.mockResolvedValue(undefined);

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    randomUuidMock.mockReturnValue("upload-1");
    buildUploadObjectKeyMock.mockReturnValue("uploads/org-1/deal-1/upload-1/lease.pdf");
    dispatchEventMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/uploads"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("lists uploads for the scoped deal", async () => {
    listUploadsForDealMock.mockResolvedValue([{ id: "upload-1", filename: "lease.pdf" }]);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/uploads"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploads: [{ id: "upload-1", filename: "lease.pdf" }] });
    expect(listUploadsForDealMock).toHaveBeenCalledWith({
      dealId: "deal-1",
      orgId: "org-1",
    });
  });

  it("uploads a file, persists metadata, and dispatches upload.created", async () => {
    createUploadRecordForDealMock.mockResolvedValue({ id: "upload-1", filename: "lease.pdf" });

    const formData = new FormData();
    formData.append("file", new File(["hello world"], "lease.pdf", { type: "application/pdf" }));
    formData.append("kind", "legal");

    const req = new NextRequest("http://localhost/api/deals/deal-1/uploads", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1" }) });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ upload: { id: "upload-1", filename: "lease.pdf" } });
    expect(uploadDealFileToGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { orgId: "org-1", userId: "user-1" },
        objectKey: "uploads/org-1/deal-1/upload-1/lease.pdf",
        contentType: "application/pdf",
      }),
    );
    expect(ensureDealUploadAccessMock).toHaveBeenCalledWith({
      dealId: "deal-1",
      orgId: "org-1",
    });
    expect(createUploadRecordForDealMock).toHaveBeenCalledWith({
      uploadId: expect.any(String),
      orgId: "org-1",
      dealId: "deal-1",
      userId: "user-1",
      kind: "legal",
      filename: "lease.pdf",
      contentType: "application/pdf",
      sizeBytes: 11,
      storageObjectKey: "uploads/org-1/deal-1/upload-1/lease.pdf",
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "upload.created",
      dealId: "deal-1",
      uploadId: "upload-1",
      orgId: "org-1",
    });
  });
});
