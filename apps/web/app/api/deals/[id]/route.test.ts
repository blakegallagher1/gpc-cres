import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dispatchEventMock,
  sentryCaptureExceptionMock,
  sentryFlushMock,
  getDealDetailMock,
  updateDealMock,
  deleteDealMock,
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
    dispatchEventMock: vi.fn().mockResolvedValue(undefined),
    sentryCaptureExceptionMock: vi.fn(),
    sentryFlushMock: vi.fn().mockResolvedValue(undefined),
    getDealDetailMock: vi.fn(),
    updateDealMock: vi.fn(),
    deleteDealMock: vi.fn(),
    DealRouteErrorMock,
  };
});

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@gpc/server", () => ({
  getDealDetail: getDealDetailMock,
  updateDeal: updateDealMock,
  deleteDeal: deleteDealMock,
  DealRouteError: DealRouteErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
  flush: sentryFlushMock,
}));

import { DELETE, GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

describe("/api/deals/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    dispatchEventMock.mockReset();
    dispatchEventMock.mockResolvedValue(undefined);
    sentryCaptureExceptionMock.mockReset();
    sentryFlushMock.mockReset();
    sentryFlushMock.mockResolvedValue(undefined);
    getDealDetailMock.mockReset();
    updateDealMock.mockReset();
    deleteDealMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest(`http://localhost/api/deals/${DEAL_ID}`), {
      params: Promise.resolve({ id: DEAL_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealDetailMock).not.toHaveBeenCalled();
  });

  it("delegates GET to the package service", async () => {
    getDealDetailMock.mockResolvedValue({
      deal: {
        id: DEAL_ID,
        name: "Deal One",
        packContext: { hasPack: false },
        parcels: [],
      },
    });

    const res = await GET(new NextRequest(`http://localhost/api/deals/${DEAL_ID}`), {
      params: Promise.resolve({ id: DEAL_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deal.id).toBe(DEAL_ID);
    expect(getDealDetailMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      DEAL_ID,
      expect.objectContaining({
        fetchImpl: expect.any(Function),
      }),
    );
  });

  it("maps package route errors for GET", async () => {
    getDealDetailMock.mockRejectedValue(new DealRouteErrorMock(404, "Deal not found"));

    const res = await GET(new NextRequest(`http://localhost/api/deals/${DEAL_ID}`), {
      params: Promise.resolve({ id: DEAL_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Deal not found" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("maps package route errors for PATCH", async () => {
    updateDealMock.mockRejectedValue(new DealRouteErrorMock(400, "No valid fields provided"));

    const res = await PATCH(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Deal" }),
      }),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "No valid fields provided" });
  });

  it("delegates PATCH and dispatches stage and status transitions", async () => {
    updateDealMock.mockResolvedValue({
      deal: { id: DEAL_ID, name: "Updated Deal", status: "TRIAGE_DONE" },
      stageChange: {
        dealId: DEAL_ID,
        orgId: ORG_ID,
        from: "ORIGINATION",
        to: "SCREENING",
      },
      statusChange: {
        dealId: DEAL_ID,
        orgId: ORG_ID,
        from: "INTAKE",
        to: "TRIAGE_DONE",
      },
    });

    const res = await PATCH(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "TRIAGE_DONE", name: "Updated Deal" }),
      }),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      deal: { id: DEAL_ID, name: "Updated Deal", status: "TRIAGE_DONE" },
    });
    expect(updateDealMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      DEAL_ID,
      { status: "TRIAGE_DONE", name: "Updated Deal" },
      expect.objectContaining({
        name: "Updated Deal",
        status: "TRIAGE_DONE",
      }),
    );
    expect(dispatchEventMock).toHaveBeenCalledTimes(2);
    expect(dispatchEventMock.mock.calls[0]?.[0]).toEqual({
      type: "deal.stageChanged",
      dealId: DEAL_ID,
      from: "ORIGINATION",
      to: "SCREENING",
      orgId: ORG_ID,
    });
    expect(dispatchEventMock.mock.calls[1]?.[0]).toEqual({
      type: "deal.statusChanged",
      dealId: DEAL_ID,
      from: "INTAKE",
      to: "TRIAGE_DONE",
      orgId: ORG_ID,
    });
  });

  it("delegates DELETE to the package service", async () => {
    deleteDealMock.mockResolvedValue({ success: true });

    const res = await DELETE(new NextRequest(`http://localhost/api/deals/${DEAL_ID}`), {
      params: Promise.resolve({ id: DEAL_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(deleteDealMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID },
      DEAL_ID,
    );
  });
});
