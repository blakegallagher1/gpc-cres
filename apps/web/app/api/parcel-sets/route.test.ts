import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetParcelSetStore } from "@gpc/server/services/parcel-set.service";

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

import { POST } from "./route";

describe("POST /api/parcel-sets", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resetParcelSetStore();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          origin: {
            kind: "selection",
            parcelIds: ["parcel-1"],
            source: "map",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("creates a selection parcel set", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          label: "Active selection",
          origin: {
            kind: "selection",
            parcelIds: ["parcel-1", "parcel-2"],
            source: "map",
          },
          metadata: {
            source: "map-panel",
          },
        }),
      }),
    );

    const body = (await response.json()) as {
      parcelSet: {
        definition: { orgId: string; label: string | null };
        materialization: { memberIds: string[]; count: number } | null;
      };
    };

    expect(response.status).toBe(201);
    expect(body.parcelSet.definition.orgId).toBe("org-1");
    expect(body.parcelSet.definition.label).toBe("Active selection");
    expect(body.parcelSet.materialization?.memberIds).toEqual(["parcel-1", "parcel-2"]);
    expect(body.parcelSet.materialization?.count).toBe(2);
  });

  it("rejects empty selected parcel ids", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          origin: {
            kind: "selection",
            parcelIds: [],
            source: "map",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid viewport bbox", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          origin: {
            kind: "viewport",
            spatial: {
              kind: "bbox",
              bounds: [-91.1, 30.5, -91.2, 30.4],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid polygon geometry", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          origin: {
            kind: "spatial",
            spatial: {
              kind: "polygon",
              coordinates: [[
                [-91.2, 30.4],
                [-91.1, 30.4],
                [-91.1, 30.5],
                [-91.2, 30.5],
              ]],
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects oversized metadata payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const metadata = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`key-${index}`, `value-${index}`]),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/parcel-sets", {
        method: "POST",
        body: JSON.stringify({
          origin: {
            kind: "selection",
            parcelIds: ["parcel-1"],
            source: "agent",
          },
          metadata,
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
