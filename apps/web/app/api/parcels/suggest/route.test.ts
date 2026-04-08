import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeApiRouteMock, suggestParcelsForRouteMock } = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  suggestParcelsForRouteMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server", () => ({
  suggestParcelsForRoute: suggestParcelsForRouteMock,
}));

import { GET } from "./route";

describe("GET /api/parcels/suggest", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    suggestParcelsForRouteMock.mockReset();
  });

  it("returns 401 when unauthorized", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });

    const res = await GET(new NextRequest("http://localhost/api/parcels/suggest?q=7618"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("passes validation errors through from the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    suggestParcelsForRouteMock.mockResolvedValue({
      status: 400,
      body: { error: "Invalid limit" },
      upstream: "org",
      resultCount: 0,
      details: { validationError: "invalid_limit" },
    });

    const res = await GET(
      new NextRequest("http://localhost/api/parcels/suggest?q=7618&limit=0"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid limit" });
  });

  it("returns suggestions and cache headers from the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    suggestParcelsForRouteMock.mockResolvedValue({
      status: 200,
      body: {
        suggestions: [
          {
            id: "UID1",
            parcelId: "UID1",
            address: "7618 Copperfield Court, Baton Rouge, LA",
            hasGeometry: true,
            source: "org",
          },
        ],
      },
      cacheControl: "private, max-age=15, stale-while-revalidate=60",
      upstream: "org",
      resultCount: 1,
      details: {},
    });

    const res = await GET(
      new NextRequest("http://localhost/api/parcels/suggest?q=7618%20copperfield&limit=5"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=15, stale-while-revalidate=60",
    );
    expect(body.suggestions).toHaveLength(1);
    expect(suggestParcelsForRouteMock).toHaveBeenCalledWith({
      orgId: "org-1",
      query: "7618 copperfield",
      rawLimit: "5",
    });
  });
});
