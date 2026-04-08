import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listBuyersMock,
  createBuyerMock,
  buyerValidationErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listBuyersMock: vi.fn(),
  createBuyerMock: vi.fn(),
  buyerValidationErrorMock: class BuyerValidationError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listBuyers: listBuyersMock,
  createBuyer: createBuyerMock,
  BuyerValidationError: buyerValidationErrorMock,
}));

import { GET, POST } from "./route";

describe("/api/buyers route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    listBuyersMock.mockReset();
    createBuyerMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/buyers"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("delegates buyer listing to the package seam", async () => {
    listBuyersMock.mockResolvedValue([{ id: "buyer-1", name: "Acquirer One" }]);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/buyers?search=acquirer&buyerType=INDUSTRIAL&dealId=deal-1&withDeals=true",
      ),
    );

    expect(res.status).toBe(200);
    expect(listBuyersMock).toHaveBeenCalledWith("org-1", {
      search: "acquirer",
      buyerType: "INDUSTRIAL",
      dealId: "deal-1",
      withDeals: true,
    });
    expect(await res.json()).toEqual({
      buyers: [{ id: "buyer-1", name: "Acquirer One" }],
    });
  });

  it("delegates buyer creation to the package seam", async () => {
    createBuyerMock.mockResolvedValue({
      id: "buyer-2",
      name: "Acquirer Two",
      buyerType: "INDUSTRIAL",
    });

    const res = await POST(
      new NextRequest("http://localhost/api/buyers", {
        method: "POST",
        body: JSON.stringify({
          name: "Acquirer Two",
          buyerType: "INDUSTRIAL",
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(createBuyerMock).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        name: "Acquirer Two",
        buyerType: "INDUSTRIAL",
      }),
    );
    expect(await res.json()).toEqual({
      buyer: { id: "buyer-2", name: "Acquirer Two", buyerType: "INDUSTRIAL" },
    });
  });

  it("surfaces validation errors from the package seam", async () => {
    createBuyerMock.mockRejectedValue(
      new buyerValidationErrorMock("name and buyerType are required"),
    );

    const res = await POST(
      new NextRequest("http://localhost/api/buyers", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "name and buyerType are required",
    });
  });
});
