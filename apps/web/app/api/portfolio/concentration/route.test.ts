import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getConcentrationAnalysisMock,
  captureExceptionMock,
  isSchemaDriftErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getConcentrationAnalysisMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  isSchemaDriftErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getConcentrationAnalysis: getConcentrationAnalysisMock,
}));

vi.mock("@/lib/api/prismaSchemaFallback", () => ({
  EMPTY_CONCENTRATION_RESPONSE: {
    geographic: [],
    sku: [],
    vintageYear: [],
    riskTier: [],
    lender: [],
    hhi: {
      parish: { value: 0, band: "green", top3: [] },
      sku: { value: 0, band: "green", top3: [] },
      lender: { value: 0, band: "green", top3: [] },
      hasAlert: false,
    },
  },
  isSchemaDriftError: isSchemaDriftErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/concentration", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getConcentrationAnalysisMock.mockReset();
    captureExceptionMock.mockReset();
    isSchemaDriftErrorMock.mockReset();
    isSchemaDriftErrorMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/concentration"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns concentration analysis for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getConcentrationAnalysisMock.mockResolvedValue({
      geographic: [{ name: "EBR", share: 0.7 }],
      sku: [{ name: "IOS", share: 0.8 }],
      vintageYear: [],
      riskTier: [],
      lender: [],
      hhi: {
        parish: { value: 2400, band: "amber", top3: ["EBR"] },
        sku: { value: 3200, band: "red", top3: ["IOS"] },
        lender: { value: 0, band: "green", top3: [] },
        hasAlert: true,
      },
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio/concentration"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      geographic: [{ name: "EBR", share: 0.7 }],
      sku: [{ name: "IOS", share: 0.8 }],
      vintageYear: [],
      riskTier: [],
      lender: [],
      hhi: {
        parish: { value: 2400, band: "amber", top3: ["EBR"] },
        sku: { value: 3200, band: "red", top3: ["IOS"] },
        lender: { value: 0, band: "green", top3: [] },
        hasAlert: true,
      },
    });
    expect(getConcentrationAnalysisMock).toHaveBeenCalledWith("org-1");
  });

  it("returns the empty concentration fallback on schema drift", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    const error = new Error("relation does not exist");
    getConcentrationAnalysisMock.mockRejectedValue(error);
    isSchemaDriftErrorMock.mockReturnValue(true);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/concentration"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      geographic: [],
      sku: [],
      vintageYear: [],
      riskTier: [],
      lender: [],
      hhi: {
        parish: { value: 0, band: "green", top3: [] },
        sku: { value: 0, band: "green", top3: [] },
        lender: { value: 0, band: "green", top3: [] },
        hasAlert: false,
      },
    });
  });
});