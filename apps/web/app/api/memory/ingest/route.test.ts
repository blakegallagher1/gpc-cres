import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  ingestCompsMock,
  orgMembershipFindFirstMock,
  addMarketDataPointMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  ingestCompsMock: vi.fn(),
  orgMembershipFindFirstMock: vi.fn(),
  addMarketDataPointMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/memoryIngestion.service", () => ({
  MemoryIngestionService: {
    ingestComps: ingestCompsMock,
  },
}));

vi.mock("@/lib/services/compToMarket", () => ({
  extractParishFromAddress: vi.fn().mockReturnValue("East Baton Rouge"),
}));

vi.mock("@/lib/services/marketMonitor.service", () => ({
  addMarketDataPoint: addMarketDataPointMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    orgMembership: {
      findFirst: orgMembershipFindFirstMock,
    },
  },
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
    resolveAuthMock.mockReset();
    ingestCompsMock.mockReset();
    orgMembershipFindFirstMock.mockReset();
    addMarketDataPointMock.mockReset();
    addMarketDataPointMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify(buildValidPayload()),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(ingestCompsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify({ sourceType: "manual_entry", comps: [] }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request");
  });

  it("returns 403 when request org differs and user is not a member", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    orgMembershipFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/memory/ingest", {
      method: "POST",
      body: JSON.stringify(buildValidPayload({ orgId: ZERO_UUID })),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden: User not member of org" });
    expect(ingestCompsMock).not.toHaveBeenCalled();
  });

  it("accepts compatibility zero UUID orgId and executes ingestion", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ZERO_UUID });
    ingestCompsMock.mockResolvedValue({
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
    expect(ingestCompsMock).toHaveBeenCalledTimes(1);
    expect(orgMembershipFindFirstMock).not.toHaveBeenCalled();
  });
});
