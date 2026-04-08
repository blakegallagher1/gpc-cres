import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getPropertySurveyForDealMock,
  upsertPropertySurveyForDealMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getPropertySurveyForDealMock: vi.fn(),
  upsertPropertySurveyForDealMock: vi.fn(),
  DealAccessErrorMock: class DealAccessError extends Error {
    status: number;

    constructor(status: number) {
      super(status === 403 ? "Forbidden" : "Deal not found");
      this.name = "DealAccessError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getPropertySurveyForDeal: getPropertySurveyForDealMock,
  upsertPropertySurveyForDeal: upsertPropertySurveyForDealMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const PROPERTY_SURVEY_RECORD = {
  id: "66666666-6666-4666-8666-666666666666",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  surveyCompletedDate: "2026-01-18T00:00:00.000Z",
  acreageConfirmed: 12.75,
  encroachments: ["Encroachment A"],
  setbacks: { north: "10 ft", south: "12 ft" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("GET /api/deals/[id]/property-survey", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getPropertySurveyForDealMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getPropertySurveyForDealMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getPropertySurveyForDealMock.mockRejectedValue(new DealAccessErrorMock(403));

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns property survey for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getPropertySurveyForDealMock.mockResolvedValue({
      propertySurvey: {
        ...PROPERTY_SURVEY_RECORD,
        acreageConfirmed: "12.75",
      },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.propertySurvey).toMatchObject({
      id: PROPERTY_SURVEY_RECORD.id,
      acreageConfirmed: "12.75",
      surveyCompletedDate: PROPERTY_SURVEY_RECORD.surveyCompletedDate,
      encroachments: PROPERTY_SURVEY_RECORD.encroachments,
    });
    expect(getPropertySurveyForDealMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("PUT /api/deals/[id]/property-survey", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    upsertPropertySurveyForDealMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`, {
      method: "PUT",
      body: JSON.stringify({
        surveyCompletedDate: "2026-01-18T00:00:00.000Z",
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(upsertPropertySurveyForDealMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is empty", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid property survey payload");
    expect(upsertPropertySurveyForDealMock).not.toHaveBeenCalled();
  });

  it("upserts property survey for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    upsertPropertySurveyForDealMock.mockResolvedValue({
      propertySurvey: {
        ...PROPERTY_SURVEY_RECORD,
        acreageConfirmed: "15.25",
        encroachments: ["Encroachment B"],
      },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`, {
      method: "PUT",
      body: JSON.stringify({
        surveyCompletedDate: "2026-02-01T00:00:00.000Z",
        acreageConfirmed: 15.25,
        encroachments: ["Encroachment B"],
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.propertySurvey.acreageConfirmed).toBe("15.25");
    expect(upsertPropertySurveyForDealMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      payload: expect.objectContaining({
        surveyCompletedDate: new Date("2026-02-01T00:00:00.000Z"),
        acreageConfirmed: 15.25,
        encroachments: ["Encroachment B"],
      }),
    });
  });
});
