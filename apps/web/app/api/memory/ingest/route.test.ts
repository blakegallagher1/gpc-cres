import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  processMemoryIngestionMock,
  MemoryIngestionAccessErrorMock,
} = vi.hoisted(() => {
  class TestMemoryIngestionAccessError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "MemoryIngestionAccessError";
      this.status = status;
    }
  }

  return {
    authorizeApiRouteMock: vi.fn(),
    processMemoryIngestionMock: vi.fn(),
    MemoryIngestionAccessErrorMock: TestMemoryIngestionAccessError,
  };
});

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server", () => ({
  processMemoryIngestion: processMemoryIngestionMock,
  MemoryIngestionAccessError: MemoryIngestionAccessErrorMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

function buildValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "manual_entry",
    comps: [
      {
        address: "123 Main St",
        city: "Baton Rouge",
        state: "LA",
        propertyType: "warehouse",
        transactionType: "sale",
        source: "manual_entry",
      },
    ],
    ...overrides,
  };
}

describe("POST /api/memory/ingest", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    processMemoryIngestionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });
    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify(buildValidPayload()),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(processMemoryIngestionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is invalid", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { userId: USER_ID, orgId: ORG_ID },
    });
    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify({ sourceType: "manual_entry", comps: [] }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request");
    expect(processMemoryIngestionMock).not.toHaveBeenCalled();
  });

  it("returns service-level access errors", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { userId: USER_ID, orgId: ORG_ID },
    });
    processMemoryIngestionMock.mockRejectedValue(
      new MemoryIngestionAccessErrorMock("Forbidden: User not member of org", 403),
    );

    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify(buildValidPayload({ orgId: ZERO_UUID })),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden: User not member of org" });
  });

  it("executes ingestion through the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { userId: USER_ID, orgId: ZERO_UUID },
    });
    processMemoryIngestionMock.mockResolvedValue({
      success: true,
      requestId: "22222222-2222-4222-8222-222222222222",
      totalComps: 1,
      newEntities: 1,
      duplicatesSkipped: 0,
      draftsCreated: 0,
      verifiedCreated: 1,
      collisionsDetected: 0,
      innovationQueueAdded: 0,
      entityIds: [],
      draftMemoryIds: [],
      verifiedMemoryIds: [],
      collisionAlertIds: [],
      warnings: [],
      errors: [],
      processingTimeMs: 5,
    });

    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify(buildValidPayload({ orgId: ZERO_UUID })),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(processMemoryIngestionMock).toHaveBeenCalledTimes(1);
    expect(processMemoryIngestionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        orgId: ZERO_UUID,
        request: expect.objectContaining({
          orgId: ZERO_UUID,
          userId: USER_ID,
        }),
      }),
    );
  });
});
