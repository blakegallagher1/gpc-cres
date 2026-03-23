import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ParcelSetService,
  resetParcelSetStore,
} from "@gpc/server/services/parcel-set.service";

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

import { GET } from "./route";

describe("GET /api/parcel-sets/[id]", () => {
  const service = new ParcelSetService();

  beforeEach(() => {
    resolveAuthMock.mockReset();
    resetParcelSetStore();
  });

  it("returns a created parcel set for the same org", async () => {
    const created = await service.createParcelSet({
      orgId: "org-1",
      origin: {
        kind: "selection",
        parcelIds: ["parcel-1"],
        source: "map",
      },
    });
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await GET(
      new NextRequest(`http://localhost/api/parcel-sets/${created.definition.id}`),
      { params: Promise.resolve({ id: created.definition.id }) },
    );
    const body = (await response.json()) as {
      parcelSet: {
        definition: { id: string; orgId: string };
        materialization: { count: number } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.parcelSet.definition.id).toBe(created.definition.id);
    expect(body.parcelSet.definition.orgId).toBe("org-1");
    expect(body.parcelSet.materialization?.count).toBe(1);
  });

  it("returns 404 for a parcel set owned by another org", async () => {
    const created = await service.createParcelSet({
      orgId: "org-1",
      origin: {
        kind: "selection",
        parcelIds: ["parcel-1"],
        source: "deal",
      },
    });
    resolveAuthMock.mockResolvedValue({ userId: "user-2", orgId: "org-2" });

    const response = await GET(
      new NextRequest(`http://localhost/api/parcel-sets/${created.definition.id}`),
      { params: Promise.resolve({ id: created.definition.id }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for an invalid parcel set id", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await GET(
      new NextRequest("http://localhost/api/parcel-sets/%20"),
      { params: Promise.resolve({ id: " " }) },
    );

    expect(response.status).toBe(400);
  });
});
