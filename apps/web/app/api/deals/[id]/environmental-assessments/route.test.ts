import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listEnvironmentalAssessmentsForDealMock,
  createEnvironmentalAssessmentForDealMock,
  updateEnvironmentalAssessmentForDealMock,
  deleteEnvironmentalAssessmentForDealMock,
  DealAccessErrorMock,
  EnvironmentalAssessmentNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listEnvironmentalAssessmentsForDealMock: vi.fn(),
  createEnvironmentalAssessmentForDealMock: vi.fn(),
  updateEnvironmentalAssessmentForDealMock: vi.fn(),
  deleteEnvironmentalAssessmentForDealMock: vi.fn(),
  DealAccessErrorMock: class DealAccessError extends Error {
    constructor(status) {
      super(status === 403 ? "Forbidden" : "Deal not found");
      this.name = "DealAccessError";
      this.status = status;
    }
  },
  EnvironmentalAssessmentNotFoundErrorMock:
    class EnvironmentalAssessmentNotFoundError extends Error {
      constructor() {
        super("Environmental assessment not found");
        this.name = "EnvironmentalAssessmentNotFoundError";
      }
    },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listEnvironmentalAssessmentsForDeal: listEnvironmentalAssessmentsForDealMock,
  createEnvironmentalAssessmentForDeal: createEnvironmentalAssessmentForDealMock,
  updateEnvironmentalAssessmentForDeal: updateEnvironmentalAssessmentForDealMock,
  deleteEnvironmentalAssessmentForDeal: deleteEnvironmentalAssessmentForDealMock,
  DealAccessError: DealAccessErrorMock,
  EnvironmentalAssessmentNotFoundError: EnvironmentalAssessmentNotFoundErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const ENVIRONMENTAL_ASSESSMENT_RECORD = {
  id: "44444444-4444-4444-8444-444444444444",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  reportType: "Phase I ESA",
  reportDate: "2026-02-01T00:00:00.000Z",
  consultantName: "Acme Environmental",
  reportTitle: "Phase I ESA",
  recs: ["Past petroleum use"],
  deMinimisConditions: ["Minor fill dirt removal"],
  phaseIiRecommended: true,
  phaseIiScope: "Site soil borings",
  estimatedRemediationCost: "125000",
  sourceUploadId: null,
  notes: "Auto-created from phase I ESA review",
};

describe("GET /api/deals/[id]/environmental-assessments", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listEnvironmentalAssessmentsForDealMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/environmental-assessments`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listEnvironmentalAssessmentsForDealMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listEnvironmentalAssessmentsForDealMock.mockRejectedValue(
      new DealAccessErrorMock(403),
    );

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/environmental-assessments`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns 400 when deal id is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/deals/not-a-uuid/environmental-assessments");
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid deal id");
    expect(listEnvironmentalAssessmentsForDealMock).not.toHaveBeenCalled();
  });

  it("returns environmental assessments for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listEnvironmentalAssessmentsForDealMock.mockResolvedValue([
      {
        ...ENVIRONMENTAL_ASSESSMENT_RECORD,
        createdAt: null,
        updatedAt: null,
      },
    ]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/environmental-assessments`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.environmentalAssessments).toEqual([
      {
        ...ENVIRONMENTAL_ASSESSMENT_RECORD,
        estimatedRemediationCost: "125000",
        reportDate: "2026-02-01T00:00:00.000Z",
        createdAt: null,
        updatedAt: null,
      },
    ]);
    expect(listEnvironmentalAssessmentsForDealMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("POST /api/deals/[id]/environmental-assessments", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createEnvironmentalAssessmentForDealMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(
      `http://localhost/api/deals/${DEAL_ID}/environmental-assessments`,
      {
        method: "POST",
        body: JSON.stringify({ reportType: "Phase I ESA" }),
      }
    );

    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(createEnvironmentalAssessmentForDealMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/environmental-assessments`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid environmental assessment payload");
    expect(createEnvironmentalAssessmentForDealMock).not.toHaveBeenCalled();
  });

  it("creates environmental assessment for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createEnvironmentalAssessmentForDealMock.mockResolvedValue({
      ...ENVIRONMENTAL_ASSESSMENT_RECORD,
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/environmental-assessments`, {
      method: "POST",
      body: JSON.stringify({ reportType: "Phase I ESA", consultantName: "Acme Environmental" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.environmentalAssessment.reportType).toBe("Phase I ESA");
    expect(createEnvironmentalAssessmentForDealMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      input: {
        reportType: "Phase I ESA",
        consultantName: "Acme Environmental",
      },
    });
  });
});
