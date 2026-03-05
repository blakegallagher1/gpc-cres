import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  ensureSavedGeofencesTableMock,
  queryRawMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  ensureSavedGeofencesTableMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/geofenceTable", () => ({
  ensureSavedGeofencesTable: ensureSavedGeofencesTableMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/geofences route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    ensureSavedGeofencesTableMock.mockReset();
    queryRawMock.mockReset();
  });

  it("GET returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/geofences");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(ensureSavedGeofencesTableMock).not.toHaveBeenCalled();
  });

  it("GET returns geofences for the org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ensureSavedGeofencesTableMock.mockResolvedValue(undefined);
    const createdAt = new Date("2026-03-01T00:00:00.000Z");
    queryRawMock.mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Baton Rouge Core",
        coordinates: [[[[-91.2, 30.4]]]],
        created_at: createdAt,
      },
    ]);

    const req = new NextRequest("http://localhost/api/geofences");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.geofences).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Baton Rouge Core",
        coordinates: [[[[-91.2, 30.4]]]],
        createdAt: createdAt.toISOString(),
      },
    ]);
    expect(ensureSavedGeofencesTableMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("POST returns 400 for invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ensureSavedGeofencesTableMock.mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost/api/geofences", {
      method: "POST",
      body: JSON.stringify({ name: "", coordinates: [] }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("POST returns 201 and created geofence", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ensureSavedGeofencesTableMock.mockResolvedValue(undefined);
    const createdAt = new Date("2026-03-01T00:00:00.000Z");
    queryRawMock.mockResolvedValue([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Ascension Edge",
        coordinates: [[[-91.1, 30.3]]],
        created_at: createdAt,
      },
    ]);

    const req = new NextRequest("http://localhost/api/geofences", {
      method: "POST",
      body: JSON.stringify({
        name: "Ascension Edge",
        coordinates: [[[-91.1, 30.3]]],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.geofence).toEqual({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Ascension Edge",
      coordinates: [[[-91.1, 30.3]]],
      createdAt: createdAt.toISOString(),
    });
    expect(ensureSavedGeofencesTableMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});
