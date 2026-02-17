import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findDealMock,
  findPropertySurveyMock,
  upsertPropertySurveyMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findDealMock: vi.fn(),
  findPropertySurveyMock: vi.fn(),
  upsertPropertySurveyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findUnique: findDealMock,
    },
    propertySurvey: {
      findUnique: findPropertySurveyMock,
      upsert: upsertPropertySurveyMock,
    },
  },
}));

import { GET, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
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
    findDealMock.mockReset();
    findPropertySurveyMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(findDealMock).not.toHaveBeenCalled();
    expect(findPropertySurveyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: OTHER_ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
    expect(findPropertySurveyMock).not.toHaveBeenCalled();
  });

  it("returns property survey for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    findPropertySurveyMock.mockResolvedValue({ ...PROPERTY_SURVEY_RECORD });

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
    expect(findPropertySurveyMock).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID },
    });
  });
});

describe("PUT /api/deals/[id]/property-survey", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    findDealMock.mockReset();
    upsertPropertySurveyMock.mockReset();
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
    expect(upsertPropertySurveyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is empty", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/property-survey`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid property survey payload");
    expect(upsertPropertySurveyMock).not.toHaveBeenCalled();
  });

  it("upserts property survey for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    upsertPropertySurveyMock.mockResolvedValue({
      ...PROPERTY_SURVEY_RECORD,
      acreageConfirmed: 15.25,
      encroachments: ["Encroachment B"],
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
    expect(upsertPropertySurveyMock).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID },
      create: expect.objectContaining({
        dealId: DEAL_ID,
        orgId: ORG_ID,
        surveyCompletedDate: new Date("2026-02-01T00:00:00.000Z"),
        acreageConfirmed: 15.25,
        encroachments: ["Encroachment B"],
      }),
      update: expect.objectContaining({
        surveyCompletedDate: new Date("2026-02-01T00:00:00.000Z"),
        acreageConfirmed: 15.25,
        encroachments: ["Encroachment B"],
      }),
    });
  });
});
