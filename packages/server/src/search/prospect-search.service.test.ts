import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestPropertyDbGatewayMock } = vi.hoisted(() => ({
  requestPropertyDbGatewayMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {},
}));

vi.mock("./property-db-gateway.service", async () => {
  const actual = await vi.importActual<typeof import("./property-db-gateway.service")>(
    "./property-db-gateway.service",
  );

  return {
    ...actual,
    requestPropertyDbGateway: requestPropertyDbGatewayMock,
  };
});

import { searchProspectsForRoute } from "./prospect-search.service";

describe("searchProspectsForRoute", () => {
  beforeEach(() => {
    requestPropertyDbGatewayMock.mockReset();
  });

  it("maps non-ok gateway responses into gateway unavailable results", async () => {
    requestPropertyDbGatewayMock.mockResolvedValue(
      new Response("<html>error code: 1033</html>", {
        status: 530,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await searchProspectsForRoute({
      polygonCoordinates: [[
        [-91.2, 30.45],
        [-91.2, 30.35],
        [-91.1, 30.35],
        [-91.1, 30.45],
        [-91.2, 30.45],
      ]],
      requestId: "req-1",
    });

    expect(result).toEqual({
      status: 503,
      body: {
        error: "Property database unavailable",
        code: "GATEWAY_UNAVAILABLE",
      },
      upstream: "property-db",
      resultCount: 0,
      details: { errorCode: "GATEWAY_UNAVAILABLE" },
    });
  });
});
