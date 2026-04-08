import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealsMock,
  createDealMock,
  bulkUpdateDealsMock,
  sentryCaptureExceptionMock,
  DealRouteErrorMock,
} = vi.hoisted(() => {
  class DealRouteErrorMock extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    resolveAuthMock: vi.fn(),
    listDealsMock: vi.fn(),
    createDealMock: vi.fn(),
    bulkUpdateDealsMock: vi.fn(),
    sentryCaptureExceptionMock: vi.fn(),
    DealRouteErrorMock,
  };
});

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: vi.fn(),
}));

vi.mock("@gpc/server", () => ({
  listDeals: listDealsMock,
  createDeal: createDealMock,
  bulkUpdateDeals: bulkUpdateDealsMock,
  DealRouteError: DealRouteErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

import { GET, PATCH, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_LOCAL_API_URL = process.env.LOCAL_API_URL;
const ORIGINAL_LOCAL_API_KEY = process.env.LOCAL_API_KEY;

describe("/api/deals route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealsMock.mockReset();
    createDealMock.mockReset();
    bulkUpdateDealsMock.mockReset();
    sentryCaptureExceptionMock.mockReset();

    process.env.NODE_ENV = "test";
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.LOCAL_API_URL = ORIGINAL_LOCAL_API_URL;
    process.env.LOCAL_API_KEY = ORIGINAL_LOCAL_API_KEY;
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/deals"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealsMock).not.toHaveBeenCalled();
  });

  it("delegates GET to the package service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealsMock.mockResolvedValue({ deals: [{ id: DEAL_ID, name: "Deal One" }] });

    const req = new NextRequest("http://localhost/api/deals?status=INTAKE&search=test");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deals: [{ id: DEAL_ID, name: "Deal One" }] });
    expect(listDealsMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      req.url,
      expect.objectContaining({
        localApiUrl: "https://api.example.com",
        localApiKey: "test-gateway-key",
        nodeEnv: "test",
      }),
    );
  });

  it("maps package route errors for GET", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealsMock.mockRejectedValue(new DealRouteErrorMock(503, "Failed to fetch deals from backend"));

    const res = await GET(new NextRequest("http://localhost/api/deals"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: "Failed to fetch deals from backend" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("maps package route errors for POST", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealMock.mockRejectedValue(
      new DealRouteErrorMock(
        400,
        "workflowTemplateKey or legacySku must be provided",
      ),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Missing fields",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          jurisdictionId: "jur-1",
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({
      error: "workflowTemplateKey or legacySku must be provided",
    });
  });

  it("delegates POST to the package service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealMock.mockResolvedValue({ deal: { id: DEAL_ID, name: "Deal One" } });

    const req = new NextRequest("http://localhost/api/deals", {
      method: "POST",
      body: JSON.stringify({
        name: "Deal One",
        sku: "SMALL_BAY_FLEX",
        jurisdictionId: "jur-1",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ deal: { id: DEAL_ID, name: "Deal One" } });
    expect(createDealMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      expect.objectContaining({
        name: "Deal One",
        jurisdictionId: "jur-1",
        sku: "SMALL_BAY_FLEX",
      }),
      expect.objectContaining({
        localApiUrl: "https://api.example.com",
        localApiKey: "test-gateway-key",
        requestUrl: req.url,
      }),
    );
  });

  it("returns 400 for invalid bulk payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await PATCH(
      new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [] }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("ids");
    expect(bulkUpdateDealsMock).not.toHaveBeenCalled();
  });

  it("delegates PATCH bulk actions to the package service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    bulkUpdateDealsMock.mockResolvedValue({
      success: true,
      count: 1,
      deals: [{ id: DEAL_ID }],
    });

    const req = new NextRequest("http://localhost/api/deals", {
      method: "PATCH",
      body: JSON.stringify({ action: "update-status", ids: [DEAL_ID], status: "INTAKE" }),
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      count: 1,
      deals: [{ id: DEAL_ID }],
    });
    expect(bulkUpdateDealsMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      { action: "update-status", ids: [DEAL_ID], status: "INTAKE" },
      expect.objectContaining({
        localApiUrl: "https://api.example.com",
        localApiKey: "test-gateway-key",
        requestUrl: req.url,
      }),
    );
  });
});
