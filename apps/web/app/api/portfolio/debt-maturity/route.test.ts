import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDebtMaturityWallMock,
  captureExceptionMock,
  isSchemaDriftErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDebtMaturityWallMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  isSchemaDriftErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/portfolioAnalytics.service", () => ({
  getDebtMaturityWall: getDebtMaturityWallMock,
}));

vi.mock("@/lib/api/prismaSchemaFallback", () => ({
  EMPTY_DEBT_MATURITY_RESPONSE: {
    totalPortfolioDebt: 0,
    debtMaturing12Months: 0,
    debtMaturing12MonthsPct: 0,
    alert: false,
    quarters: [],
  },
  isSchemaDriftError: isSchemaDriftErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/portfolio/debt-maturity", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDebtMaturityWallMock.mockReset();
    captureExceptionMock.mockReset();
    isSchemaDriftErrorMock.mockReset();
    isSchemaDriftErrorMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/portfolio/debt-maturity"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns debt maturity analytics for the scoped org", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getDebtMaturityWallMock.mockResolvedValue({
      totalPortfolioDebt: 10000000,
      debtMaturing12Months: 2500000,
      debtMaturing12MonthsPct: 25,
      alert: true,
      quarters: [{ quarter: "2026-Q3", amount: 2500000 }],
    });

    const res = await GET(new NextRequest("http://localhost/api/portfolio/debt-maturity"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalPortfolioDebt: 10000000,
      debtMaturing12Months: 2500000,
      debtMaturing12MonthsPct: 25,
      alert: true,
      quarters: [{ quarter: "2026-Q3", amount: 2500000 }],
    });
    expect(getDebtMaturityWallMock).toHaveBeenCalledWith("org-1");
  });

  it("returns the empty debt maturity fallback on schema drift", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getDebtMaturityWallMock.mockRejectedValue(new Error("column does not exist"));
    isSchemaDriftErrorMock.mockReturnValue(true);

    const res = await GET(new NextRequest("http://localhost/api/portfolio/debt-maturity"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalPortfolioDebt: 0,
      debtMaturing12Months: 0,
      debtMaturing12MonthsPct: 0,
      alert: false,
      quarters: [],
    });
  });
});