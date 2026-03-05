import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  ensureSavedGeofencesTableMock,
  executeRawMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  ensureSavedGeofencesTableMock: vi.fn(),
  executeRawMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/geofenceTable", () => ({
  ensureSavedGeofencesTable: ensureSavedGeofencesTableMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $executeRaw: executeRawMock,
  },
}));

import { DELETE } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const GEOFENCE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /api/geofences/[id]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    ensureSavedGeofencesTableMock.mockReset();
    executeRawMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(ensureSavedGeofencesTableMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the geofence is not found for org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ensureSavedGeofencesTableMock.mockResolvedValue(undefined);
    executeRawMock.mockResolvedValue(0);

    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
    expect(ensureSavedGeofencesTableMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok when geofence is deleted", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ensureSavedGeofencesTableMock.mockResolvedValue(undefined);
    executeRawMock.mockResolvedValue(1);

    const req = new NextRequest(`http://localhost/api/geofences/${GEOFENCE_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: GEOFENCE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(ensureSavedGeofencesTableMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});
