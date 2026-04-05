import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  uploadFindManyMock,
  uploadCreateMock,
  uploadDealFileToGatewayMock,
  buildUploadObjectKeyMock,
  randomUuidMock,
  dispatchEventMock,
  captureAutomationDispatchErrorMock,
  captureExceptionMock,
  flushMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  uploadFindManyMock: vi.fn(),
  uploadCreateMock: vi.fn(),
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

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: dealFindFirstMock },
    upload: {
      findMany: uploadFindManyMock,
      create: uploadCreateMock,
    },
  },
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
    dealFindFirstMock.mockReset();
    uploadFindManyMock.mockReset();
    uploadCreateMock.mockReset();
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
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    uploadFindManyMock.mockResolvedValue([{ id: "upload-1", filename: "lease.pdf" }]);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/uploads"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploads: [{ id: "upload-1", filename: "lease.pdf" }] });
    expect(uploadFindManyMock).toHaveBeenCalledWith({
      where: { dealId: "deal-1", orgId: "org-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("uploads a file, persists metadata, and dispatches upload.created", async () => {
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    uploadCreateMock.mockResolvedValue({ id: "upload-1", filename: "lease.pdf" });

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
    expect(uploadCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        orgId: "org-1",
        dealId: "deal-1",
        kind: "legal",
        filename: "lease.pdf",
        storageObjectKey: "uploads/org-1/deal-1/upload-1/lease.pdf",
        uploadedBy: "user-1",
      }),
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "upload.created",
      dealId: "deal-1",
      uploadId: "upload-1",
      orgId: "org-1",
    });
  });
});